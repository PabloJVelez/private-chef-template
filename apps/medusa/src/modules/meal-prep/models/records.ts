import { model } from "@medusajs/framework/utils";
import { changeTypes, revisionKinds } from "../contracts";

// Scalar references have explicit composite foreign keys in the migration.
// Generated CRUD is internal persistence plumbing, never a command API.
export const MealPrepSubject = model.define("meal_prep_subject", {
  id: model.id().primaryKey(),
  chef_id: model.text(),
  customer_id: model.text(),
  kind: model.enum(["arrangement", "occurrence"]),
  parent_id: model.text().nullable(),
  parent_kind: model.text().nullable(),
  generation_key: model.text().nullable(),
  version: model.number().default(0),
});
export const MealPrepRevision = model.define("meal_prep_revision", {
  id: model.id().primaryKey(),
  subject_id: model.text(),
  kind: model.enum([...revisionKinds]),
  revision_number: model.number(),
  body: model.json(),
  contract_version: model.text(),
  created_by: model.text(),
});
export const MealPrepApproval = model.define("meal_prep_approval", {
  id: model.id().primaryKey(),
  subject_id: model.text(),
  revision_id: model.text(),
  revision_kind: model.enum([...revisionKinds]),
  decision: model.enum(["approved", "rejected"]),
  chef_actor_id: model.text(),
  expected_version: model.number(),
  contract_version: model.text(),
});
export const MealPrepChangeRequest = model.define("meal_prep_change_request", {
  id: model.id().primaryKey(),
  subject_id: model.text(),
  revision_id: model.text(),
  revision_kind: model.enum(["change"]),
  request_type: model.enum([...changeTypes]),
  base_version: model.number(),
  requested_by: model.text(),
});
export const MealPrepAudit = model.define("meal_prep_audit", {
  id: model.id().primaryKey(),
  subject_id: model.text(),
  revision_id: model.text(),
  actor_id: model.text(),
  action: model.text(),
  resulting_version: model.number(),
  contract_version: model.text(),
});
export const MealPrepOutbox = model.define("meal_prep_outbox", {
  id: model.id().primaryKey(),
  subject_id: model.text(),
  revision_id: model.text(),
  topic: model.text(),
  deduplication_key: model.text(),
  contract_version: model.text(),
  attempts: model.number().default(0),
  delivered_at: model.dateTime().nullable(),
});
export const MealPrepCommand = model.define("meal_prep_command", {
  id: model.id().primaryKey(),
  subject_id: model.text(),
  actor_id: model.text(),
  operation: model.text(),
  idempotency_key: model.text(),
  request_hash: model.text(),
  result: model.json(),
});
