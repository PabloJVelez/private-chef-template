import { DateTime } from 'luxon';
import { MedusaError, Modules } from '@medusajs/framework/utils';
import type { MedusaContainer, IUserModuleService, IEventBusModuleService } from '@medusajs/framework/types';
import type ChefEventModuleService from '../../modules/chef-event/service';
import { CHEF_EVENT_MODULE } from '../../modules/chef-event';
import type SchedulingModuleService from '../../modules/scheduling/service';
import { SCHEDULING_MODULE } from '../../modules/scheduling';
import type {
  ScheduleEditInput,
  ScheduleSnapshot,
  ScheduleEditReceipt,
} from '../../modules/chef-event/schedule-edit';
import { authorizedSiteAdmin, requireSingleStore } from '../chef-ai/access';
import { isValidIanaZone, wallClockToUtcJsDate } from '../chef-event-wall-clock';
import { requireSlot } from '../availability/query';
import { previewInput, signPreview } from './contract';

export async function authorizeScheduleEdit(container: MedusaContainer, actorId: string) {
  if (
    process.env.CHEF_AI_SCHEDULE_WRITE_ENABLED !== 'true' ||
    !authorizedSiteAdmin({ actor_id: actorId, actor_type: 'user' })
  )
    throw new MedusaError(
      MedusaError.Types.NOT_ALLOWED,
      'Schedule changes are unavailable.',
    );
  try {
    await requireSingleStore(container);
    await container.resolve<IUserModuleService>(Modules.USER).retrieveUser(actorId);
  } catch {
    throw new MedusaError(MedusaError.Types.NOT_ALLOWED, 'Current Admin user could not be verified.');
  }
}
const service = (container: MedusaContainer) => container.resolve<ChefEventModuleService>(CHEF_EVENT_MODULE);
const refuse = (message: string): never => {
  throw new MedusaError(MedusaError.Types.NOT_ALLOWED, message);
};
export function localSchedule(event: ScheduleSnapshot) {
  if (!event.timeZone || !isValidIanaZone(event.timeZone))
    refuse('Set a valid event timezone before editing this request.');
  const local = DateTime.fromJSDate(new Date(event.requestedDate), {
    zone: event.timeZone,
  });
  if (!local.isValid || local.toFormat('HH:mm') !== event.requestedTime || local.second || local.millisecond)
    refuse('This legacy arrival is inconsistent. Reconcile the event date and arrival time before editing.');
  return {
    date: local.toISODate()!,
    time: event.requestedTime,
    timezone: event.timeZone,
    instant: local.toUTC().toISO()!,
  };
}
async function validatePolicy(
  container: MedusaContainer,
  event: ScheduleSnapshot,
  date: string,
  instant: string,
) {
  if (!event.eligible)
    refuse(
      'Only an unclaimed pending request can be edited. Finish acceptance cleanup or open the event to reconcile.',
    );
  if (!event.experience_type_id)
    refuse('Choose an active catalog experience before editing this legacy request.');
  const reservations = await container
    .resolve<SchedulingModuleService>(SCHEDULING_MODULE)
    .listReservations({ owner_id: event.id, state: ['held', 'confirmed'] }, { take: 1 });
  if (reservations.length)
    refuse(
      'This request has protected Scheduling time. Reconcile it before editing; no reservation was released.',
    );
  const available = await requireSlot(container, date, event.experience_type_id!, instant, event.id);
  if (available.timezone !== event.timeZone)
    refuse('Event timezone must exactly match Settings → Availability. Reconcile the timezone first.');
}
export async function previewScheduleEdit(
  container: MedusaContainer,
  actorId: string,
  body: unknown,
  secret: string,
) {
  await authorizeScheduleEdit(container, actorId);
  const input = previewInput.parse(body);
  const event = await service(container).readScheduleEditEvent(input.eventId);
  const current = localSchedule(event);
  const date = input.date ?? current.date,
    time = input.time ?? current.time;
  // Never guess which instant a fold means, even for an unchanged ambiguous wall clock.
  const proposed = wallClockToUtcJsDate(date, time, current.timezone);
  if (!proposed)
    refuse('Choose a valid, unambiguous local date and arrival time (DST gaps/folds are unsupported).');
  const instant = proposed!.toISOString();
  await validatePolicy(container, event, date, instant);
  const { value, reference } = signPreview(
    {
      actorId,
      eventId: event.id,
      expectedRevision: event.revision,
      date,
      time,
      timezone: current.timezone,
      instant,
    },
    secret,
  );
  return {
    reference,
    operationId: value.operationId,
    eventId: event.id,
    expectedRevision: event.revision,
    expiresAt: new Date(value.expiresAt).toISOString(),
    target: { id: event.id, title: event.title || "Untitled", status: "pending" as const, revision: event.revision },
    current,
    proposed: { date, time, timezone: current.timezone, instant },
    reserved: false,
    googleAvailability: 'advisory' as const,
  };
}

/** One workflow step: the domain receipt closes the database commit/checkpoint gap. */
export async function confirmScheduleEdit(container: MedusaContainer, input: ScheduleEditInput) {
  await authorizeScheduleEdit(container, input.actorId);
  const chef = service(container);
  let receipt = await chef.readScheduleEdit(input);
  if (!receipt) {
    // Expired/missing history must never mint a replacement operation.
    if (Date.now() >= input.expiresAt)
      return {
        outcome: 'unknown' as const,
        operationId: input.operationId,
        message:
          'Preview expired and no outcome is recorded. Recover/reconcile before starting another edit.',
      };
    let rejection: string | undefined;
    try {
      const event = await chef.readScheduleEditEvent(input.eventId);
      localSchedule(event);
      if (event.revision !== input.expectedRevision) refuse('Event changed. Reload and preview again.');
      if (
        event.timeZone !== input.timezone ||
        wallClockToUtcJsDate(input.date, input.time, input.timezone)?.toISOString() !== input.instant
      )
        refuse('Preview no longer matches the event timezone or local arrival.');
      await validatePolicy(container, event, input.date, input.instant);
    } catch (error) {
      // Known policy failures are terminal for this operation; infrastructure failures stay unknown.
      if (error instanceof MedusaError) rejection = error.message;
      else throw error;
    }
    receipt = await chef.editPendingSchedule(input, rejection);
  }
  return dispatchReceipt(container, input, receipt);
}

async function dispatchReceipt(
  container: MedusaContainer,
  input: ScheduleEditInput,
  receipt: ScheduleEditReceipt,
) {
  const chef = service(container);
  if (receipt.googleSync === 'pending' && (await chef.claimScheduleEditDispatch(input))) {
    let state: 'requested' | 'failed' = 'requested';
    try {
      await container.resolve<IEventBusModuleService>(Modules.EVENT_BUS).emit({
        name: 'google-calendar.sync-requested',
        data: { chefEventId: input.eventId, operation: 'upsert' },
      });
    } catch {
      state = 'failed';
    }
    await chef.finishScheduleEditDispatch(input, state);
  }
  return {
    ...(await chef.readScheduleEdit(input))!,
    historical: true,
    reserved: false,
  };
}
export async function recoverScheduleEdit(container: MedusaContainer, input: ScheduleEditInput) {
  await authorizeScheduleEdit(container, input.actorId);
  const receipt = await service(container).readScheduleEdit(input);
  return receipt
    ? dispatchReceipt(container, input, receipt)
    : {
        outcome: 'unknown' as const,
        operationId: input.operationId,
        message:
          'No durable outcome is available. The operation may still be processing; reconcile before creating another operation.',
      };
}
