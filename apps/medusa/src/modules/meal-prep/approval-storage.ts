import { mealPrepSetupSchema } from "../../lib/availability/slots";
import {
  lockOccurrenceWork,
  linkOccurrenceWork,
} from "../shared-scheduling/occurrence-work";
import { createHash, randomUUID } from "node:crypto";
import type { EntityManager } from "@mikro-orm/knex";
import { MEAL_PREP_CONTRACT, type MealPrepPrincipal } from "./contracts";
import { revalidateCapture, readCapture } from "./capture-storage";
import { generateCandidates } from "./recurrence";
import {
  MealPrepApprovalError as Failure,
  type ApprovalCommand,
  type ApprovalState,
  menuReviewSchema,
} from "./approval-contracts";

type Subject = {
  id: string;
  chef_id: string;
  customer_id: string;
  kind: string;
  version: number;
  deleted_at: unknown;
};
const uuid = (prefix: string) => `${prefix}_${randomUUID()}`;
function authorize(s: Subject | undefined, actor: MealPrepPrincipal) {
  if (
    !s ||
    s.deleted_at ||
    s.chef_id !== actor.chefId ||
    (actor.role === "customer" && s.customer_id !== actor.customerId)
  )
    throw new Failure("NOT_FOUND");
}
async function household(
  manager: EntityManager,
  id: string,
  customerId: string,
  actor: MealPrepPrincipal,
) {
  const [h] = await manager.execute<Subject[]>(
    `select * from meal_prep_capture where id = ? for share`,
    [id],
  );
  authorize(h, actor);
  if (h.kind !== "household" || h.customer_id !== customerId)
    throw new Failure("NOT_FOUND");
}
async function latest(
  manager: EntityManager,
  id: string,
): Promise<ApprovalState> {
  const [row] = await manager.execute(
    `select body from meal_prep_approval_state where subject_id = ? order by version desc limit 1`,
    [id],
  );
  if (!row) throw new Failure("INVALID_STATE");
  return row.body;
}
export async function readApprovalState(
  manager: EntityManager,
  id: string,
  actor: MealPrepPrincipal,
) {
  const [s] = await manager.execute<Subject[]>(
    `select * from meal_prep_subject where id = ? for share`,
    [id],
  );
  authorize(s, actor);
  const state = await latest(manager, id);
  await household(manager, state.householdId, s.customer_id, actor);
  return { subjectId: id, version: s.version as number, state };
}
async function revision(
  manager: EntityManager,
  id: string,
  subjectId: string,
  kind: string,
) {
  const [r] = await manager.execute(
    `select * from meal_prep_revision where id = ? and subject_id = ? and kind = ?`,
    [id, subjectId, kind],
  );
  if (!r) throw new Failure("NOT_FOUND");
  return r;
}
async function validateMenu(
  manager: EntityManager,
  menu: unknown,
  s: Subject,
  state: ApprovalState,
  actor: MealPrepPrincipal,
) {
  const parsed = menuReviewSchema.parse(menu);
  if (!state.candidate || state.candidate.resolution.status !== "resolved")
    throw new Failure("POLICY_REQUIRED", ["D09", "DST"]);
  const snapshot = await readCapture(
    manager,
    parsed.selectionRevisionId,
    actor,
  );
  const [capture] = await manager.execute(
    `select customer_id,household_id from meal_prep_capture where id = ? for share`,
    [snapshot.captureId],
  );
  if (
    capture.customer_id !== s.customer_id ||
    capture.household_id !== state.householdId
  )
    throw new Failure("NOT_FOUND");
  // The trusted chef scope is used only for validation after ownership enforcement;
  // this does not grant the customer approval authority.
  await revalidateCapture(
    manager,
    parsed.selectionRevisionId,
    state.candidate.localDate,
    { role: "chef", chefId: actor.chefId, actorId: actor.actorId },
  );
  if (
    snapshot.body.kind !== "selection" ||
    snapshot.body.method !== state.method ||
    !snapshot.body.selection.lines.length
  )
    throw new Failure("INVALID_STATE");
}

/** Internal transaction boundary. No routes, schedulers, notifications or payment adapters invoke it.
 * All writes, decisions, audit and outbox receipts commit together. */
export async function executeApprovalCommand(
  manager: EntityManager,
  input: ApprovalCommand,
  actor: MealPrepPrincipal,
) {
  if (actor.chefId !== "chef-default") throw new Failure("NOT_FOUND");
  const chefOnly = !["request_change", "propose_menu"].includes(
    input.operation,
  );
  if (chefOnly && actor.role !== "chef") throw new Failure("NOT_FOUND");
  const hash = createHash("sha256")
    .update(JSON.stringify({ input, actor }))
    .digest("hex");
  await manager.execute(`select pg_advisory_xact_lock(hashtextextended(?,0))`, [
    `meal-prep-approval:${input.subjectId}`,
  ]);
  let work: Awaited<ReturnType<typeof lockOccurrenceWork>> | undefined;
  if (input.operation === "link_work") {
    const [owner] = await manager.execute<Subject[]>(
      `select * from meal_prep_subject where id=?`,
      [input.subjectId],
    );
    authorize(owner, actor);
    const current = await latest(manager, input.subjectId);
    await household(manager, current.householdId, owner.customer_id, actor);
    const [retry] = await manager.execute(
      `select request_hash,result from meal_prep_command where subject_id=? and actor_id=? and operation='approval_workflow' and idempotency_key=?`,
      [input.subjectId, actor.actorId, input.idempotencyKey],
    );
    if (retry) {
      if (retry.request_hash !== hash)
        throw new Failure("IDEMPOTENCY_CONFLICT");
      return retry.result as {
        subjectId: string;
        revisionId: string;
        version: number;
      };
    }
    // Settings -> block -> subject matches the shared link trigger order.
    try {
      work = await lockOccurrenceWork(manager, {
        ...input,
        chefId: actor.chefId,
      });
    } catch (error) {
      if (error instanceof Error && error.message.includes("changed"))
        throw new Failure("STALE_VERSION");
      if (error instanceof Error && error.message.includes("outside global"))
        throw new Failure("INVALID_STATE");
      throw error;
    }
  }
  // Parent-first locking prevents candidate creation from racing arrangement changes.
  let parentState: ApprovalState | undefined;
  let parent: Subject | undefined;
  if (input.operation === "record_candidate") {
    [parent] = await manager.execute(
      `select * from meal_prep_subject where id = ? for share`,
      [input.arrangementId],
    );
    authorize(parent, actor);
    if (parent!.kind !== "arrangement") throw new Failure("INVALID_STATE");
    parentState = await latest(manager, input.arrangementId);
    await household(
      manager,
      parentState.householdId,
      parent!.customer_id,
      actor,
    );
  }
  let [s] = await manager.execute<Subject[]>(
    `select * from meal_prep_subject where id = ? for update`,
    [input.subjectId],
  );
  let state: ApprovalState;
  if (s) {
    authorize(s, actor);
    state = await latest(manager, s.id);
    await household(manager, state.householdId, s.customer_id, actor);
  } else {
    if (input.expectedVersion !== 0) throw new Failure("STALE_VERSION");
    if (
      input.operation !== "propose_arrangement" &&
      input.operation !== "record_candidate"
    )
      throw new Failure("NOT_FOUND");
    const householdId =
      input.operation === "propose_arrangement"
        ? input.householdId
        : parentState!.householdId;
    const customerId =
      input.operation === "propose_arrangement"
        ? input.customerId
        : parent!.customer_id;
    await household(manager, householdId, customerId, actor);
    state = {
      householdId,
      method:
        input.operation === "propose_arrangement"
          ? input.method
          : parentState!.method,
      arrangementRevisionId: "",
      arrangementApproved: false,
      candidate: null,
      proposedMenuRevisionId: null,
      confirmedMenuRevisionId: null,
      pendingChangeRevisionId: null,
      selectionDeadline: null,
      selectionSubmittedAt: null,
      followUp: false,
      workBlockIds: [],
    };
    s = {
      id: input.subjectId,
      chef_id: actor.chefId,
      customer_id: customerId,
      kind:
        input.operation === "propose_arrangement"
          ? "arrangement"
          : "occurrence",
      version: 0,
      deleted_at: null,
    };
  }
  const [receipt] = await manager.execute(
    `select request_hash,result from meal_prep_command where subject_id=? and actor_id=? and operation='approval_workflow' and idempotency_key=?`,
    [s.id, actor.actorId, input.idempotencyKey],
  );
  if (receipt) {
    if (receipt.request_hash !== hash)
      throw new Failure("IDEMPOTENCY_CONFLICT");
    return receipt.result as {
      subjectId: string;
      revisionId: string;
      version: number;
    };
  }
  if (s.version !== input.expectedVersion) throw new Failure("STALE_VERSION");
  const revisionId = uuid("mpr"),
    version = s.version + 1;
  let kind = "change",
    body: object = { operation: input.operation };
  let decision:
    | { revisionId: string; kind: string; decision: string }
    | undefined;
  let topic = `meal_prep.${input.operation}`;
  switch (input.operation) {
    case "propose_arrangement": {
      if (s.kind !== "arrangement" || s.version !== 0)
        throw new Failure("INVALID_STATE");
      const [intake] = await manager.execute(
        `select body from meal_prep_capture_snapshot where capture_id=? order by revision_number desc limit 1`,
        [state.householdId],
      );
      if (intake?.body.intake.method !== input.method)
        throw new Failure("INVALID_STATE");
      kind = "arrangement";
      body = { recurrence: input.recurrence, method: input.method };
      state.arrangementRevisionId = revisionId;
      break;
    }
    case "approve_arrangement":
      if (
        s.kind !== "arrangement" ||
        state.arrangementApproved ||
        state.arrangementRevisionId !== input.revisionId
      )
        throw new Failure("INVALID_STATE");
      await revision(manager, input.revisionId, s.id, "arrangement");
      const [settings] = await manager.execute(
        `select meal_prep from availability_setting where id='chef-default' and deleted_at is null for share`,
      );
      const capabilities = mealPrepSetupSchema.safeParse(settings?.meal_prep);
      if (
        !capabilities.success ||
        !capabilities.data.methods[state.method].enabled
      )
        throw new Failure("INVALID_STATE");
      state.arrangementApproved = true;
      decision = {
        revisionId: input.revisionId,
        kind: "arrangement",
        decision: "approved",
      };
      break;
    case "record_candidate": {
      if (
        s.version !== 0 ||
        !parentState!.arrangementApproved ||
        parentState!.arrangementRevisionId !== input.arrangementRevisionId
      )
        throw new Failure("INVALID_STATE");
      const r = await revision(
        manager,
        input.arrangementRevisionId,
        input.arrangementId,
        "arrangement",
      );
      const candidate = generateCandidates({
        arrangementId: input.arrangementId,
        revisionId: input.arrangementRevisionId,
        recurrence: r.body.recurrence,
        bounds: { from: input.localDate, through: input.localDate },
      }).find((c) => c.slotId === input.slotId);
      if (!candidate || candidate.occurrenceId !== input.subjectId)
        throw new Failure("INVALID_INPUT");
      // Persist unresolved DST candidates visibly; never normalize or reserve them.
      state.candidate = candidate;
      state.arrangementRevisionId = input.arrangementRevisionId;
      state.arrangementApproved = true;
      body = { operation: input.operation, candidate };
      break;
    }
    case "propose_menu":
      if (
        s.kind !== "occurrence" ||
        state.confirmedMenuRevisionId ||
        state.pendingChangeRevisionId
      )
        throw new Failure("INVALID_STATE");
      await validateMenu(manager, input.menu, s, state, actor);
      kind = "menu";
      body = input.menu;
      state.proposedMenuRevisionId = revisionId;
      // Deadline eligibility belongs to the first valid submission, not its edits.
      // Each replacement still has its own immutable menu revision/created_at.
      state.selectionSubmittedAt ??= new Date().toISOString();
      break;
    case "decide_menu": {
      if (
        s.kind !== "occurrence" ||
        state.confirmedMenuRevisionId ||
        state.proposedMenuRevisionId !== input.revisionId
      )
        throw new Failure("INVALID_STATE");
      const r = await revision(manager, input.revisionId, s.id, "menu");
      if (input.decision === "approved") {
        await validateMenu(manager, r.body, s, state, actor);
        state.confirmedMenuRevisionId = input.revisionId;
      }
      state.proposedMenuRevisionId = null;
      decision = {
        revisionId: input.revisionId,
        kind: "menu",
        decision: input.decision,
      };
      break;
    }
    case "request_change":
      if (
        state.pendingChangeRevisionId ||
        (input.change.type === "pause"
          ? s.kind !== "arrangement" || !state.arrangementApproved
          : s.kind !== "occurrence")
      )
        throw new Failure("INVALID_STATE");
      if (input.change.type === "menu" || input.change.type === "portions") {
        if (!state.confirmedMenuRevisionId) throw new Failure("INVALID_STATE");
        await validateMenu(manager, input.change.menu, s, state, actor);
      }
      body = {
        change: input.change,
        baseMenuRevisionId: state.confirmedMenuRevisionId,
      };
      state.pendingChangeRevisionId = revisionId;
      break;
    case "decide_change": {
      if (state.pendingChangeRevisionId !== input.revisionId)
        throw new Failure("INVALID_STATE");
      const r = await revision(manager, input.revisionId, s.id, "change");
      if (input.decision === "approved") {
        const change = r.body.change;
        if (change.type === "pause")
          throw new Failure("POLICY_REQUIRED", ["D07", "D09"]);
        if (change.type === "skip")
          throw new Failure("POLICY_REQUIRED", ["D06", "D09"]);
        if (change.type === "reschedule")
          throw new Failure("POLICY_REQUIRED", ["D03", "D06", "D09"]);
        const [billed] = await manager.execute(
          `select id from meal_prep_bill where subject_id=?`,
          [s.id],
        );
        if (billed) throw new Failure("POLICY_REQUIRED", ["D06"]);
        if (r.body.baseMenuRevisionId !== state.confirmedMenuRevisionId)
          throw new Failure("STALE_VERSION");
        const old = await manager.execute(
          `select body from meal_prep_revision where id=?`,
          [state.confirmedMenuRevisionId],
        );
        const priorMenu = old[0].body.change?.menu ?? old[0].body;
        if (
          JSON.stringify(menuReviewSchema.parse(priorMenu).quote) !==
          JSON.stringify(menuReviewSchema.parse(change.menu).quote)
        )
          throw new Failure("POLICY_REQUIRED", ["D06"]);
        await validateMenu(manager, change.menu, s, state, actor);
        state.confirmedMenuRevisionId = input.revisionId;
      }
      state.pendingChangeRevisionId = null;
      decision = {
        revisionId: input.revisionId,
        kind: "change",
        decision: input.decision,
      };
      break;
    }
    case "link_work": {
      if (
        s.kind !== "occurrence" ||
        !state.candidate ||
        state.candidate.resolution.status !== "resolved" ||
        state.workBlockIds.includes(input.blockId)
      )
        throw new Failure("INVALID_STATE");
      const inHome = state.method === "in_home";
      if (
        inHome &&
        new Date(work!.starts_at).getTime() !==
          Date.parse(state.candidate.resolution.instant)
      )
        throw new Failure("INVALID_STATE");
      if (inHome !== (work!.purpose === "in_home"))
        throw new Failure("INVALID_STATE");
      // Explicit actual work only. Pickup/delivery do not acquire an appointment per order.
      await linkOccurrenceWork(manager, {
        blockId: input.blockId,
        occurrenceId: s.id,
        chefId: s.chef_id,
        customerId: s.customer_id,
      });
      state.workBlockIds.push(input.blockId);
      body = {
        blockId: input.blockId,
        blockVersion: input.expectedBlockVersion,
        availabilityVersion: input.expectedAvailabilityVersion,
      };
      break;
    }
    case "set_selection_deadline":
      if (
        s.kind !== "occurrence" ||
        state.confirmedMenuRevisionId ||
        state.selectionDeadline
      )
        throw new Failure("INVALID_STATE");
      state.selectionDeadline = input.deadline;
      body = { deadline: input.deadline };
      break;
    case "flag_missed_selection":
      if (
        s.kind !== "occurrence" ||
        !state.selectionDeadline ||
        Date.parse(input.now) <= Date.parse(state.selectionDeadline) ||
        (state.selectionSubmittedAt &&
          Date.parse(state.selectionSubmittedAt) <=
            Date.parse(state.selectionDeadline)) ||
        state.confirmedMenuRevisionId ||
        state.followUp
      )
        throw new Failure("INVALID_STATE");
      state.followUp = true;
      topic = "meal_prep.selection_follow_up";
      body = { deadline: state.selectionDeadline, checkedAt: input.now };
      break;
  }
  if (s.version === 0) {
    await manager.execute(
      `insert into meal_prep_subject(id,chef_id,customer_id,kind,parent_id,parent_kind,generation_key) values(?,?,?,?,?,?,?)`,
      [
        s.id,
        s.chef_id,
        s.customer_id,
        s.kind,
        input.operation === "record_candidate" ? input.arrangementId : null,
        s.kind === "occurrence" ? "arrangement" : null,
        state.candidate?.generationKey ?? null,
      ],
    );
  }
  await manager.execute(
    `update meal_prep_subject set version=?,updated_at=now() where id=?`,
    [version, s.id],
  );
  await manager.execute(
    `insert into meal_prep_revision(id,subject_id,kind,revision_number,body,contract_version,created_by) values(?,?,?,?,?::jsonb,?,?)`,
    [
      revisionId,
      s.id,
      kind,
      version,
      JSON.stringify(body),
      MEAL_PREP_CONTRACT,
      actor.actorId,
    ],
  );
  if (decision)
    await manager.execute(
      `insert into meal_prep_approval(id,subject_id,revision_id,revision_kind,decision,chef_actor_id,expected_version,contract_version) values(?,?,?,?,?,?,?,?)`,
      [
        uuid("mpa"),
        s.id,
        decision.revisionId,
        decision.kind,
        decision.decision,
        actor.actorId,
        input.expectedVersion,
        MEAL_PREP_CONTRACT,
      ],
    );
  if (input.operation === "request_change")
    await manager.execute(
      `insert into meal_prep_change_request(id,subject_id,revision_id,revision_kind,request_type,base_version,requested_by) values(?,?,?,'change',?,?,?)`,
      [
        uuid("mpch"),
        s.id,
        revisionId,
        input.change.type,
        input.expectedVersion,
        actor.actorId,
      ],
    );
  await manager.execute(
    `insert into meal_prep_approval_state(id,subject_id,revision_id,version,body) values(?,?,?,?,?::jsonb)`,
    [uuid("mpas"), s.id, revisionId, version, JSON.stringify(state)],
  );
  await manager.execute(
    `insert into meal_prep_audit(id,subject_id,revision_id,actor_id,action,resulting_version,contract_version) values(?,?,?,?,?,?,?)`,
    [
      uuid("mpa"),
      s.id,
      revisionId,
      actor.actorId,
      input.operation,
      version,
      MEAL_PREP_CONTRACT,
    ],
  );
  // Reference-only notification intent; dispatcher remains disabled. Never a payment instruction.
  await manager.execute(
    `insert into meal_prep_outbox(id,subject_id,revision_id,topic,deduplication_key,contract_version) values(?,?,?,?,?,?)`,
    [
      uuid("mpo"),
      s.id,
      revisionId,
      topic,
      `approval:${revisionId}`,
      MEAL_PREP_CONTRACT,
    ],
  );
  const result = { subjectId: s.id, revisionId, version };
  await manager.execute(
    `insert into meal_prep_command(id,subject_id,actor_id,operation,idempotency_key,request_hash,result) values(?,?,?,'approval_workflow',?,?,?::jsonb)`,
    [
      uuid("mpc"),
      s.id,
      actor.actorId,
      input.idempotencyKey,
      hash,
      JSON.stringify(result),
    ],
  );
  return result;
}
