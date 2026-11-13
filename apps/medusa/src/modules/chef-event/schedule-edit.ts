import type { EntityManager } from '@medusajs/framework/mikro-orm/knex';
import { MedusaError } from '@medusajs/framework/utils';

export type ScheduleEditInput = {
  operationId: string;
  actorId: string;
  eventId: string;
  expectedRevision: string;
  date: string;
  time: string;
  timezone: string;
  instant: string;
  expiresAt: number;
};
export type ScheduleSnapshot = {
  id: string;
  status: string;
  revision: string;
  requestedDate: Date | string;
  requestedTime: string;
  timeZone: string;
  experience_type_id: string | null;
  eligible: boolean;
};
export type ScheduleEditOutcome = {
  operationId: string;
  eventId: string;
  outcome: 'saved' | 'no_change' | 'rejected';
  reason?: string;
  committedRevision: string | null;
  date: string;
  time: string;
  timezone: string;
  instant: string;
};
export type ScheduleEditReceipt = {
  outcome: ScheduleEditOutcome;
  googleSync: 'not_requested' | 'pending' | 'unknown' | 'requested' | 'failed';
};

// Every event field and tuple revision, including writes that omit updated_at.
const revision = `md5(to_jsonb(e)::text || ':' || e.xmin::text)`;
export async function scheduleSnapshot(manager: EntityManager, id: string): Promise<ScheduleSnapshot> {
  const [row] = await manager.execute(
    `select e.id, e.status, ${revision} as revision, e."requestedDate", e."requestedTime",
    e."timeZone", e.experience_type_id,
    (e.status = 'pending' and e."acceptanceToken" is null and e."productId" is null
      and e."occupiedStart" is null and e."occupiedEnd" is null and e."availabilitySnapshot" is null
      and not exists (select 1 from scheduling_reservation r where r.owner_id = e.id
        and r.deleted_at is null and r.state in ('held','confirmed'))
      and (e."acceptanceExecution" is null or exists (
        select 1 from chef_event_acceptance_attempt a where a.id = e."acceptanceExecution" and a.event_id = e.id
        and a.deleted_at is null and a.state = 'aborted' and a.cleanup_completed_at is not null))) as eligible
    from chef_event e where e.id = ? and e.deleted_at is null`,
    [id],
  );
  if (!row) throw new MedusaError(MedusaError.Types.NOT_FOUND, 'Private Event request not found.');
  return row as ScheduleSnapshot;
}

export async function scheduleReceipt(
  manager: EntityManager,
  input: ScheduleEditInput,
): Promise<ScheduleEditReceipt | null> {
  const [row] = await manager.execute(
    `select outcome, google_sync, input = ?::jsonb as matches
    from chef_event_schedule_edit where id = ?`,
    [JSON.stringify(input), input.operationId],
  );
  if (!row) return null;
  if (!row.matches)
    throw new MedusaError(
      MedusaError.Types.NOT_ALLOWED,
      'Operation identity belongs to different input or actor.',
    );
  return { outcome: row.outcome, googleSync: row.google_sync };
}

/** Caller owns a module-local transaction. No external work or cross-module managers. */
export async function commitScheduleEdit(
  manager: EntityManager,
  input: ScheduleEditInput,
  rejection?: string,
): Promise<ScheduleEditReceipt> {
  // Same lock as bindAcceptance/cancelEvent; claim/finalize UPDATEs also acquire it.
  await manager.execute('select id from chef_event where id = ? for update', [input.eventId]);
  const prior = await scheduleReceipt(manager, input);
  if (prior) return prior;
  const current = await scheduleSnapshot(manager, input.eventId);
  let reason = rejection;
  if (Date.now() >= input.expiresAt) reason = 'Preview expired. Create a new preview.';
  if (!current.eligible)
    reason =
      'Request is accepted, accepting, cancelled, or needs acceptance cleanup. Open the event to reconcile.';
  if (current.revision !== input.expectedRevision) reason = 'Event changed. Reload and preview again.';
  const unchanged =
    new Date(current.requestedDate).toISOString() === input.instant && current.requestedTime === input.time;
  if (!reason && !unchanged) {
    await manager.execute(
      `update chef_event set "requestedDate" = ?, "requestedTime" = ?, updated_at = clock_timestamp()
      where id = ?`,
      [input.instant, input.time, input.eventId],
    );
  }
  const saved = !reason && !unchanged ? await scheduleSnapshot(manager, input.eventId) : current;
  const outcome: ScheduleEditOutcome = {
    operationId: input.operationId,
    eventId: input.eventId,
    outcome: reason ? 'rejected' : unchanged ? 'no_change' : 'saved',
    ...(reason ? { reason } : {}),
    committedRevision: reason ? null : saved.revision,
    date: input.date,
    time: input.time,
    timezone: input.timezone,
    instant: input.instant,
  };
  const googleSync = outcome.outcome === 'saved' ? 'pending' : 'not_requested';
  await manager.execute(
    `insert into chef_event_schedule_edit(id, input, outcome, google_sync)
    values (?, ?::jsonb, ?::jsonb, ?)`,
    [input.operationId, JSON.stringify(input), JSON.stringify(outcome), googleSync],
  );
  return { outcome, googleSync };
}
