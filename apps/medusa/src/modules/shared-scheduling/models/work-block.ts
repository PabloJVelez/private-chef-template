import { model } from "@medusajs/framework/utils";

// Explicit actual work, never a fulfillment window or an order-count allocation.
// Generated CRUD is internal plumbing, not an approved scheduling API.
export const ChefWorkBlock = model.define("chef_work_block", {
  id: model.id().primaryKey(),
  resource_id: model.text(),
  chef_id: model.text(),
  purpose: model.enum(["in_home", "preparation", "delivery", "handoff"]),
  starts_at: model.dateTime(),
  ends_at: model.dateTime(),
  version: model.number().default(1),
  released_at: model.dateTime().nullable(),
});
