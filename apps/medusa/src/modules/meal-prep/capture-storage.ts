import { createHash, randomUUID } from "node:crypto";
import type { EntityManager } from "@mikro-orm/knex";
import { mealPrepSetupSchema } from "../../lib/availability/slots";
import { MEAL_PREP_CONTRACT, type MealPrepPrincipal } from "./contracts";
import {
  captureBodySchema,
  householdBodySchema,
  offerBodySchema,
  validateSelection,
  MealPrepCaptureError as CaptureError,
  type SaveCaptureInput,
  type CaptureResult,
  type SelectionBody,
} from "./capture-contracts";

type Capture = {
  id: string;
  chef_id: string;
  customer_id: string | null;
  household_id: string | null;
  kind: string;
  version: number;
  deleted_at: unknown;
};
function authorize(capture: Capture | undefined, principal: MealPrepPrincipal) {
  if (
    !capture ||
    capture.deleted_at ||
    capture.chef_id !== principal.chefId ||
    (principal.role === "customer" &&
      capture.customer_id !== principal.customerId)
  )
    throw new CaptureError("NOT_FOUND");
}
async function ownedHousehold(
  manager: EntityManager,
  id: string,
  customerId: string,
  principal: MealPrepPrincipal,
) {
  const [household] = await manager.execute<Capture[]>(
    `select * from meal_prep_capture where id = ? for share`,
    [id],
  );
  authorize(household, principal);
  if (household.kind !== "household" || household.customer_id !== customerId)
    throw new CaptureError("NOT_FOUND");
  return household as Capture;
}
async function reference(
  manager: EntityManager,
  id: string,
  principal: MealPrepPrincipal,
  kind: "offer" | "household",
  householdId?: string,
) {
  const [snapshot] = await manager.execute(
    `select * from meal_prep_capture_snapshot where id = ?`,
    [id],
  );
  if (!snapshot) throw new CaptureError("NOT_FOUND");
  const [capture] = await manager.execute<Capture[]>(
    `select * from meal_prep_capture where id = ? for share`,
    [snapshot.capture_id],
  );
  if (kind === "household") authorize(capture, principal);
  if (
    !capture ||
    capture.deleted_at ||
    capture.chef_id !== principal.chefId ||
    capture.kind !== kind ||
    (householdId !== undefined && capture.id !== householdId)
  )
    throw new CaptureError("NOT_FOUND");
  if (snapshot.revision_number !== capture.version)
    throw new CaptureError("STALE_REFERENCE");
  return snapshot;
}
async function validateReferences(
  manager: EntityManager,
  body: SelectionBody,
  householdId: string,
  principal: MealPrepPrincipal,
) {
  // Same installation scope as Availability/PR 3; no inferred multi-chef membership.
  if (principal.chefId !== "chef-default") throw new CaptureError("NOT_FOUND");
  const [settings] =
    await manager.execute(`select version, meal_prep from availability_setting
    where id = 'chef-default' and deleted_at is null for share`);
  const setup = mealPrepSetupSchema.safeParse(settings?.meal_prep);
  if (!setup.success) throw new CaptureError("METHOD_OR_STYLE_DISABLED");
  const offered = await reference(
    manager,
    body.offerRevisionId,
    principal,
    "offer",
  );
  const intake = await reference(
    manager,
    body.intakeRevisionId,
    principal,
    "household",
    householdId,
  );
  const household = householdBodySchema.parse(intake.body);
  if (household.intake.method !== body.method)
    throw new CaptureError("INVALID_SELECTION");
  validateSelection(body, offerBodySchema.parse(offered.body), setup.data);
  return settings.version as number;
}

/** Called only inside the service's transaction. No external effects or private logging. */
export async function saveCapture(
  manager: EntityManager,
  input: SaveCaptureInput,
  principal: MealPrepPrincipal,
): Promise<CaptureResult> {
  if (principal.chefId !== "chef-default") throw new CaptureError("NOT_FOUND");
  // An advisory transaction lock serializes creation as well as retries for an absent root.
  await manager.execute(
    `select pg_advisory_xact_lock(hashtextextended(?, 0))`,
    [`meal-prep-capture:${input.captureId}`],
  );
  let [capture] = await manager.execute<Capture[]>(
    `select * from meal_prep_capture where id = ? for update`,
    [input.captureId],
  );
  if (capture) {
    authorize(capture, principal);
    if (
      capture.kind !== input.body.kind ||
      capture.customer_id !== input.customerId ||
      capture.household_id !== input.householdId
    )
      throw new CaptureError("NOT_FOUND");
  } else {
    // Household enrollment/ownership comes only from a trusted chef command. No public enrollment mechanism.
    if (
      principal.role !== "chef" &&
      (input.body.kind !== "selection" ||
        input.customerId !== principal.customerId)
    )
      throw new CaptureError("NOT_FOUND");
    if (input.expectedVersion !== 0) throw new CaptureError("STALE_VERSION");
  }
  if (input.householdId)
    await ownedHousehold(
      manager,
      input.householdId,
      input.customerId!,
      principal,
    );
  const hash = createHash("sha256")
    .update(JSON.stringify({ input, principal }))
    .digest("hex");
  // Authorization precedes receipt lookup, including household soft-deletion/revocation.
  const [receipt] = await manager.execute(
    `select request_hash,result from meal_prep_capture_receipt
    where capture_id = ? and actor_id = ? and idempotency_key = ?`,
    [input.captureId, principal.actorId, input.idempotencyKey],
  );
  if (receipt) {
    if (receipt.request_hash !== hash)
      throw new CaptureError("IDEMPOTENCY_CONFLICT");
    return receipt.result as CaptureResult;
  }
  if (capture && capture.version !== input.expectedVersion)
    throw new CaptureError("STALE_VERSION");
  const availabilityVersion =
    input.body.kind === "selection"
      ? await validateReferences(
          manager,
          input.body,
          input.householdId!,
          principal,
        )
      : null;
  if (!capture) {
    await manager.execute(
      `insert into meal_prep_capture(id,chef_id,customer_id,kind,household_id)
      values (?,?,?,?,?)`,
      [
        input.captureId,
        principal.chefId,
        input.customerId,
        input.body.kind,
        input.householdId,
      ],
    );
    capture = {
      id: input.captureId,
      chef_id: principal.chefId,
      customer_id: input.customerId,
      household_id: input.householdId,
      kind: input.body.kind,
      version: 0,
      deleted_at: null,
    };
  }
  const result = {
    revisionId: `mpcs_${randomUUID()}`,
    version: capture.version + 1,
  };
  await manager.execute(
    `update meal_prep_capture set version = ?, updated_at = now() where id = ?`,
    [result.version, input.captureId],
  );
  await manager.execute(
    `insert into meal_prep_capture_snapshot
    (id,capture_id,chef_id,kind,revision_number,body,offer_revision_id,intake_revision_id,availability_version,contract_version,created_by)
    values (?,?,?,?,?,?::jsonb,?,?,?,?,?)`,
    [
      result.revisionId,
      input.captureId,
      principal.chefId,
      input.body.kind,
      result.version,
      JSON.stringify(input.body),
      input.body.kind === "selection" ? input.body.offerRevisionId : null,
      input.body.kind === "selection" ? input.body.intakeRevisionId : null,
      availabilityVersion,
      MEAL_PREP_CONTRACT,
      principal.actorId,
    ],
  );
  // Reference-only durable command audit. Sensitive bodies remain in private snapshots.
  await manager.execute(
    `insert into meal_prep_capture_receipt(id,capture_id,revision_id,actor_id,idempotency_key,request_hash,result)
    values (?,?,?,?,?,?,?::jsonb)`,
    [
      `mpcr_${randomUUID()}`,
      input.captureId,
      result.revisionId,
      principal.actorId,
      input.idempotencyKey,
      hash,
      JSON.stringify(result),
    ],
  );
  return result;
}

export async function readCapture(
  manager: EntityManager,
  revisionId: string,
  principal: MealPrepPrincipal,
) {
  const [snapshot] = await manager.execute(
    `select * from meal_prep_capture_snapshot where id = ?`,
    [revisionId],
  );
  if (!snapshot) throw new CaptureError("NOT_FOUND");
  const [capture] = await manager.execute<Capture[]>(
    `select * from meal_prep_capture where id = ? for share`,
    [snapshot.capture_id],
  );
  authorize(capture, principal);
  if (capture.household_id)
    await ownedHousehold(
      manager,
      capture.household_id,
      capture.customer_id!,
      principal,
    );
  return {
    captureId: capture.id as string,
    revisionId: snapshot.id as string,
    version: snapshot.revision_number as number,
    body: captureBodySchema.parse(snapshot.body),
    availabilityVersion: snapshot.availability_version as number | null,
  };
}

/** Revalidate a request for a later approval workflow. No approval is applied here.
 * The caller must supply the agreed occurrence date and retain this transaction through approval. */
export async function revalidateCapture(
  manager: EntityManager,
  revisionId: string,
  agreedDate: string,
  principal: MealPrepPrincipal,
) {
  const snapshot = await readCapture(manager, revisionId, principal);
  if (principal.role !== "chef" || snapshot.body.kind !== "selection")
    throw new CaptureError("NOT_FOUND");
  const [capture] = await manager.execute<Capture[]>(
    `select * from meal_prep_capture where id = ? for share`,
    [snapshot.captureId],
  );
  if (capture.version !== snapshot.version)
    throw new CaptureError("STALE_REFERENCE");
  if (snapshot.body.requestedDate !== agreedDate)
    throw new CaptureError("INVALID_SELECTION");
  const availabilityVersion = await validateReferences(
    manager,
    snapshot.body,
    capture.household_id!,
    principal,
  );
  return { revisionId, version: snapshot.version, availabilityVersion };
}
