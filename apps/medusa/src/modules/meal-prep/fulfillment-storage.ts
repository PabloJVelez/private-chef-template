import { isDeepStrictEqual } from "node:util";
import { createHash, randomUUID } from "node:crypto";
import type { EntityManager } from "@mikro-orm/knex";
import type { MealPrepPrincipal } from "./contracts";
import { readApprovalState } from "./approval-storage";
import { readCapture } from "./capture-storage";
import {
  fulfillmentPaths,
  FulfillmentError as Failure,
  type FulfillmentCommand,
} from "./fulfillment-contracts";
import type { ApprovalState } from "./approval-contracts";

const uuid = () => `mpful_${randomUUID()}`;
const hash = (value: unknown) =>
  createHash("sha256").update(JSON.stringify(value)).digest("hex");
async function lock(
  manager: EntityManager,
  id: string,
  actor: MealPrepPrincipal,
) {
  if (actor.role !== "chef" || actor.chefId !== "chef-default")
    throw new Failure("NOT_FOUND");
  // Same order as approval/billing: serialize before reading any operational state.
  await manager.execute(`select pg_advisory_xact_lock(hashtextextended(?,0))`, [
    `meal-prep-approval:${id}`,
  ]);
  const [s] = await manager.execute(
    `select kind from meal_prep_subject where id=? for update`,
    [id],
  );
  const current = await readApprovalState(manager, id, actor);
  if (s?.kind !== "occurrence") throw new Failure("NOT_FOUND");
  return current;
}
async function history(manager: EntityManager, id: string) {
  return manager.execute<any[]>(
    `select * from meal_prep_fulfillment_event where subject_id=? order by version`,
    [id],
  );
}
function snapshotMatches(plan: any, state: ApprovalState) {
  return (
    plan &&
    plan.method === state.method &&
    plan.snapshot.menuRevisionId === state.confirmedMenuRevisionId &&
    isDeepStrictEqual(plan.snapshot.candidate, state.candidate) &&
    isDeepStrictEqual(plan.snapshot.workBlockIds, state.workBlockIds)
  );
}
async function approvedSelection(
  manager: EntityManager,
  state: ApprovalState,
  actor: MealPrepPrincipal,
) {
  if (
    !state.arrangementApproved ||
    !state.confirmedMenuRevisionId ||
    state.candidate?.resolution.status !== "resolved"
  )
    throw new Failure("APPROVAL_REQUIRED");
  const [menu] = await manager.execute(
    `select body from meal_prep_revision where id=?`,
    [state.confirmedMenuRevisionId],
  );
  const body = menu.body.change?.menu ?? menu.body; // approved menu/portion change envelope
  const selection = await readCapture(manager, body.selectionRevisionId, actor);
  if (
    selection.body.kind !== "selection" ||
    selection.body.method !== state.method
  )
    throw new Failure("INVALID_STATE");
  return selection.body;
}
export async function command(
  manager: EntityManager,
  input: FulfillmentCommand,
  actor: MealPrepPrincipal,
) {
  const current = await lock(manager, input.subjectId, actor);
  const [prior] = await manager.execute(
    `select request_hash,result from meal_prep_command where subject_id=? and actor_id=? and operation='fulfillment' and idempotency_key=?`,
    [input.subjectId, actor.actorId, input.idempotencyKey],
  );
  const requestHash = hash({ input, actor });
  if (prior) {
    if (prior.request_hash !== requestHash)
      throw new Failure("IDEMPOTENCY_CONFLICT");
    return prior.result as { eventId: string; version: number };
  }
  if (current.version !== input.expectedVersion)
    throw new Failure("STALE_VERSION");
  const events = await history(manager, input.subjectId);
  const plan = events.filter((e) => e.kind === "plan").at(-1);
  let status: string | null = null,
    snapshot: object | null = null;
  if (input.operation === "plan") {
    const selection = await approvedSelection(manager, current.state, actor);
    if (input.details.method !== current.state.method)
      throw new Failure("METHOD_MISMATCH");
    if (
      input.details.method !== "pickup" &&
      input.details.intakeRevisionId !== selection.intakeRevisionId
    )
      throw new Failure("INTAKE_MISMATCH");
    if (events.some((e) => e.kind === "progress"))
      throw new Failure("ALREADY_STARTED");
    snapshot = {
      details: input.details,
      policyFixture: input.policyFixture,
      menuRevisionId: current.state.confirmedMenuRevisionId,
      candidate: current.state.candidate,
      workBlockIds: current.state.workBlockIds,
    };
    status = "planned";
  } else if (input.operation === "progress") {
    if (!snapshotMatches(plan, current.state) || plan.id !== input.planId)
      throw new Failure("STALE_PLAN");
    const previous =
      events.filter((e) => e.plan_id === plan.id).at(-1)?.status ?? "planned";
    const path = fulfillmentPaths[current.state.method];
    if (path[path.indexOf(previous) + 1] !== input.status)
      throw new Failure("INVALID_TRANSITION");
    // Actual work is explicitly linked using shared scheduling. No automatic per-order reservation.
    if (!current.state.workBlockIds.length) throw new Failure("WORK_REQUIRED");
    const links = await manager.execute(
      `select b.id from chef_work_block b join chef_work_block_occurrence l on l.block_id=b.id
      where l.occurrence_id=? and b.released_at is null and b.deleted_at is null`,
      [input.subjectId],
    );
    if (
      current.state.workBlockIds.some(
        (id) => !links.some((b: any) => b.id === id),
      )
    )
      throw new Failure("WORK_REQUIRED");
    status = input.status;
  } else if (input.operation === "resolve_follow_up") {
    if (
      !events.some(
        (e) => e.id === input.flagId && e.kind === "flag_follow_up",
      ) ||
      events.some((e) => e.resolves_id === input.flagId)
    )
      throw new Failure("INVALID_FOLLOW_UP");
  }
  const [reference] = await manager.execute(
    `select revision_id from meal_prep_approval_state where subject_id=? order by version desc limit 1`,
    [input.subjectId],
  );
  const result = { eventId: uuid(), version: current.version + 1 };
  await manager.execute(
    `update meal_prep_subject set version=?,updated_at=now() where id=?`,
    [result.version, input.subjectId],
  );
  await manager.execute(
    `insert into meal_prep_fulfillment_event(id,subject_id,version,actor_id,kind,method,plan_id,status,reason,resolves_id,snapshot,test_only)
    values(?,?,?,?,?,?,?,?,?,?,?::jsonb,true)`,
    [
      result.eventId,
      input.subjectId,
      result.version,
      actor.actorId,
      input.operation,
      current.state.method,
      input.operation === "progress" ? input.planId : null,
      status,
      input.operation === "flag_follow_up" ? input.reason : null,
      input.operation === "resolve_follow_up" ? input.flagId : null,
      snapshot ? JSON.stringify(snapshot) : null,
    ],
  );
  await manager.execute(
    `insert into meal_prep_audit(id,subject_id,revision_id,actor_id,action,resulting_version,contract_version)
    values(?,?,?,?,?,?, '1.1-r4')`,
    [
      uuid(),
      input.subjectId,
      reference.revision_id,
      actor.actorId,
      `test_fulfillment_${input.operation}`,
      result.version,
    ],
  );
  await manager.execute(
    `insert into meal_prep_outbox(id,subject_id,revision_id,topic,deduplication_key,contract_version)
    values(?,?,?,'meal_prep.test_fulfillment_recorded',?,'1.1-r4')`,
    [uuid(), input.subjectId, reference.revision_id, result.eventId],
  );
  await manager.execute(
    `insert into meal_prep_command(id,subject_id,actor_id,operation,idempotency_key,request_hash,result)
    values(?,?,?,'fulfillment',?,?,?::jsonb)`,
    [
      uuid(),
      input.subjectId,
      actor.actorId,
      input.idempotencyKey,
      requestHash,
      JSON.stringify(result),
    ],
  );
  return result;
}

/** Chef-only explicit scope. References and operational facts; no intake bodies or provider secrets.
 * Locks produce a coherent snapshot against approval, billing and fulfillment commands.
 * Counts are descriptive. This report is never consulted by an acceptance command. */
export async function operations(
  manager: EntityManager,
  subjectIds: string[],
  actor: MealPrepPrincipal,
) {
  const occurrences = [];
  for (const id of [...subjectIds].sort()) {
    const current = await lock(manager, id, actor);
    const events = await history(manager, id);
    const plan = events.filter((e) => e.kind === "plan").at(-1);
    const flags = events
      .filter(
        (e) =>
          e.kind === "flag_follow_up" &&
          !events.some((r) => r.resolves_id === e.id),
      )
      .map((e) => ({ id: e.id as string, reason: e.reason as string }));
    const [payment] = await manager.execute(
      `select b.id,
      exists(select 1 from meal_prep_payment_collection c where c.bill_id=b.id) as collected,
      (select state from meal_prep_payment_attempt a where a.bill_id=b.id) as manual_state,
      (select state from meal_prep_autopay_attempt a where a.bill_id=b.id) as autopay_state,
      exists(select 1 from meal_prep_payment_attempt a where a.bill_id=b.id and a.follow_up) as manual_follow_up,
      exists(select 1 from meal_prep_autopay_attempt a where a.bill_id=b.id and a.follow_up) as autopay_follow_up,
      (select state from meal_prep_payment_notification n where n.bill_id=b.id) as payment_link_notification,
      (select count(*)::int from meal_prep_notification_intent n where n.bill_id=b.id and n.state in ('pending','inflight')) as pending_notifications
      from meal_prep_bill b where b.subject_id=?`,
      [id],
    );
    let selectedServings: number | null = null;
    if (current.state.confirmedMenuRevisionId) {
      const selection = await approvedSelection(manager, current.state, actor);
      // Sum explicit servings as entered, never infer multiplication/price units from quantities.
      selectedServings = selection.selection.lines.reduce(
        (n, line) => n + line.servings,
        0,
      );
    }
    const drift = await manager.execute(
      `select d.source_id from chef_time_reservation_drift d
      join chef_work_block_occurrence l on l.block_id=d.source_id
      where d.source_kind='meal_prep_work' and l.occurrence_id=?`,
      [id],
    );
    occurrences.push({
      reservationDrift: drift.length > 0,
      subjectId: id,
      version: current.version,
      method: current.state.method,
      candidate: current.state.candidate,
      confirmedMenuRevisionId: current.state.confirmedMenuRevisionId,
      pendingChangeRevisionId: current.state.pendingChangeRevisionId,
      workBlockIds: current.state.workBlockIds,
      fulfillment: {
        planId: (plan?.id as string | undefined) ?? null,
        status:
          (events.filter((e) => e.kind === "progress").at(-1)?.status as
            | string
            | undefined) ??
          plan?.status ??
          "unplanned",
        needsReplan: !!plan && !snapshotMatches(plan, current.state),
      },
      payment: payment ?? null,
      selectedServings,
      followUp: {
        operational: flags,
        missedSelection: current.state.followUp,
        pendingChange: !!current.state.pendingChangeRevisionId,
        payment: !!(payment?.manual_follow_up || payment?.autopay_follow_up),
      },
    });
  }
  const summaries: {
    localDate: string | null;
    method: string;
    orders: number;
    selectedServings: number;
    menusAwaitingApproval: number;
  }[] = [];
  for (const row of occurrences) {
    const date = row.candidate?.localDate ?? null;
    let group = summaries.find(
      (g) => g.localDate === date && g.method === row.method,
    );
    if (!group) {
      group = {
        localDate: date,
        method: row.method,
        orders: 0,
        selectedServings: 0,
        menusAwaitingApproval: 0,
      };
      summaries.push(group);
    }
    group.orders++;
    group.selectedServings += row.selectedServings ?? 0;
    if (row.selectedServings === null) group.menusAwaitingApproval++;
  }
  return { testOnly: true as const, occurrences, summaries };
}
