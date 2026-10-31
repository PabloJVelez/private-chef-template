import type { EntityManager } from "@mikro-orm/knex";
import { availabilitySettingsSchema } from "../../lib/availability/slots";
import { withinGlobalHours } from "./global-hours";

/** Shared scheduling owns its tables. Retain this caller transaction through the
 * occurrence command's state/audit/outbox writes. Lock settings -> block -> subject,
 * matching direct link writers. This links chef-planned work, not a method window. */
export async function lockOccurrenceWork(
  manager: EntityManager,
  input: {
    blockId: string;
    chefId: string;
    expectedBlockVersion: number;
    expectedAvailabilityVersion: number;
  },
) {
  const [settings] = await manager.execute(
    `select * from availability_setting where id='chef-default' and deleted_at is null and version=? for share`,
    [input.expectedAvailabilityVersion],
  );
  if (!settings) throw new Error("Availability changed or is not configured");
  const [block] = await manager.execute(
    `select * from chef_work_block where id=? and chef_id=? and version=? and released_at is null and deleted_at is null for update`,
    [input.blockId, input.chefId, input.expectedBlockVersion],
  );
  if (!block) throw new Error("Work block changed or is unavailable");
  if (
    !withinGlobalHours(
      new Date(block.starts_at).toISOString(),
      new Date(block.ends_at).toISOString(),
      availabilitySettingsSchema.parse(settings),
    )
  )
    throw new Error("Work interval is outside global working availability");
  return block;
}
export async function linkOccurrenceWork(
  manager: EntityManager,
  input: {
    blockId: string;
    occurrenceId: string;
    chefId: string;
    customerId: string;
  },
) {
  await manager.execute(
    `insert into chef_work_block_occurrence(block_id,occurrence_id,chef_id,customer_id,subject_kind) values(?,?,?,?,'occurrence')`,
    [input.blockId, input.occurrenceId, input.chefId, input.customerId],
  );
}
