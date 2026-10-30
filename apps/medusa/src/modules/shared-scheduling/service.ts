import type { Context } from "@medusajs/framework/types";
import type { EntityManager } from "@mikro-orm/knex";
import {
  InjectManager,
  InjectTransactionManager,
  MedusaContext,
  MedusaService,
} from "@medusajs/framework/utils";
import { z } from "zod";
import { ChefWorkBlock } from "./models/work-block";
import { availabilitySettingsSchema } from "../../lib/availability/slots";
import { withinGlobalHours } from "./global-hours";

const replacement = z
  .object({
    id: z.string().min(1),
    chefId: z.string().min(1),
    expectedVersion: z.number().int().positive(),
    expectedAvailabilityVersion: z.number().int().nonnegative(),
    start: z.string().datetime({ offset: true }),
    end: z.string().datetime({ offset: true }),
  })
  .strict()
  .refine(
    (v) => Date.parse(v.end) > Date.parse(v.start),
    "Invalid occupied interval",
  );

export default class SharedSchedulingService extends MedusaService({
  ChefWorkBlock,
}) {
  @InjectManager()
  async listOccupiedIntervals(
    input: { start: string; end: string; ignoreEventId?: string },
    @MedusaContext() context: Context<EntityManager> = {},
  ): Promise<{ start: string; end: string }[]> {
    const rows = await context.manager!.execute(
      `select starts_at, ends_at from chef_time_reservation
       where resource_id = 'chef-default' and active
         and tstzrange(starts_at, ends_at, '[)') && tstzrange(?, ?, '[)')
         and not (source_kind = 'private_event' and source_id = coalesce(?, ''))`,
      [input.start, input.end, input.ignoreEventId ?? null],
    );
    return rows.map((r) => ({
      start: new Date(r.starts_at).toISOString(),
      end: new Date(r.ends_at).toISOString(),
    }));
  }

  /** Admin-only facts for manual review. Opaque foundation menu drafts are not
   * approved serving/order data and are deliberately not counted as such. */
  @InjectManager()
  async reviewWorkBlocks(
    input: { start: string; end: string },
    @MedusaContext() context: Context<EntityManager> = {},
  ) {
    const rows = await context.manager!.execute(
      `select b.id, b.purpose, b.starts_at, b.ends_at, count(l.occurrence_id)::integer as linked_occurrences
       from chef_work_block b
       join chef_time_reservation r on r.source_kind = 'meal_prep_work' and r.source_id = b.id and r.active
       left join chef_work_block_occurrence l on l.block_id = b.id
       where r.resource_id = 'chef-default' and tstzrange(r.starts_at, r.ends_at, '[)') && tstzrange(?, ?, '[)')
       group by b.id order by b.starts_at, b.id`,
      [input.start, input.end],
    );
    return rows.map((r) => ({
      id: r.id,
      purpose: r.purpose,
      start: new Date(r.starts_at).toISOString(),
      end: new Date(r.ends_at).toISOString(),
      linked_occurrences: r.linked_occurrences,
    }));
  }

  @InjectManager()
  async reservationDrift(@MedusaContext() context: Context<EntityManager> = {}) {
    return context.manager!.execute("select source_kind, source_id from chef_time_reservation_drift");
  }

  /** Internal transaction primitive only; no route/job invokes it. It does NOT
   * approve an occurrence or choose method-window/financial policies. Linked
   * blocks are database-guarded until an all-occurrence approval workflow exists.
   * The caller supplies a trusted chef scope, never request JSON authorization. */
  @InjectManager()
  async replaceUnlinkedWorkBlock(
    input: z.infer<typeof replacement>,
    @MedusaContext() context: Context<EntityManager> = {},
  ) {
    return this.replaceUnlinkedWorkBlock_(replacement.parse(input), context);
  }

  @InjectTransactionManager()
  protected async replaceUnlinkedWorkBlock_(
    input: z.infer<typeof replacement>,
    @MedusaContext() context: Context<EntityManager> = {},
  ) {
    // Same row locked by existing complete-snapshot saves, including direct SQL
    // updates. Hold until the reservation replacement commits or rolls back.
    const [settings] = await context.transactionManager!.execute(
      `select * from availability_setting where id = 'chef-default' and deleted_at is null
       and version = ? for share`,
      [input.expectedAvailabilityVersion],
    );
    if (!settings) throw new Error("Availability changed or is not configured");
    if (!withinGlobalHours(input.start, input.end, availabilitySettingsSchema.parse(settings)))
      throw new Error("Work interval is outside global working availability");
    const rows = await context.transactionManager!.execute(
      `update chef_work_block set starts_at = ?, ends_at = ?, version = version + 1, updated_at = now()
       where id = ? and chef_id = ? and version = ? and released_at is null and deleted_at is null returning version`,
      [input.start, input.end, input.id, input.chefId, input.expectedVersion],
    );
    if (!rows.length) throw new Error("Work block changed or is unavailable");
    return rows[0] as { version: number };
  }
}
