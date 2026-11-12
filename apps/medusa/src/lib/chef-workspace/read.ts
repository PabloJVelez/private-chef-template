import type { MedusaContainer } from '@medusajs/framework/types';
import type { z } from '@medusajs/framework/zod';
import { MedusaError } from '@medusajs/framework/utils';
import { CHEF_EVENT_MODULE } from '../../modules/chef-event';
import type ChefEventModuleService from '../../modules/chef-event/service';
import { SCHEDULING_MODULE } from '../../modules/scheduling';
import type SchedulingModuleService from '../../modules/scheduling/service';
import type { CalendarResult, RequestPage } from './contracts';
import { calendarQuery, requestQuery, eventFilters } from './query';
import { privateEventSummary, summaryFields } from './private-event';

export const MAX_CALENDAR_ENTRIES = 5000;
export async function readRequests(scope: MedusaContainer, query: z.infer<typeof requestQuery>): Promise<RequestPage> {
  const chef = scope.resolve<ChefEventModuleService>(CHEF_EVENT_MODULE);
  const [events, count] = await chef.listAndCountChefEvents(eventFilters(query), {
    select: [...summaryFields],
    take: query.limit,
    skip: query.offset,
    order: { requestedDate: 'ASC', id: 'ASC' },
  });
  return { items: events.map(privateEventSummary), count, limit: query.limit, offset: query.offset };
}
export async function readCalendar(
  scope: MedusaContainer,
  query: z.infer<typeof calendarQuery>,
): Promise<CalendarResult> {
  const chef = scope.resolve<ChefEventModuleService>(CHEF_EVENT_MODULE);
  const events = await chef.readCalendarEvents(query, MAX_CALENDAR_ENTRIES + 1);
  const range = { start: query.start, end: query.end };
  // Never present a partial calendar as complete; ask the user to narrow their range/filter.
  if (events.length > MAX_CALENDAR_ENTRIES) return { entries: [], range, complete: false };
  if (!events.length) return { entries: [], range, complete: true };
  const scheduling = scope.resolve<SchedulingModuleService>(SCHEDULING_MODULE);
  const [reservations, count] = await scheduling.listAndCountReservations(
    {
      owner_id: events.map((e) => e.id),
      state: ['held', 'confirmed'],
    },
    { select: ['owner_id', 'starts_at', 'ends_at', 'state'], take: MAX_CALENDAR_ENTRIES + 1 },
  );
  if (count > MAX_CALENDAR_ENTRIES)
    throw new MedusaError(MedusaError.Types.UNEXPECTED_STATE, 'Too many protected intervals to display safely.');
  const byOwner = new Map<string, typeof reservations>();
  for (const reservation of reservations) {
    const rows = byOwner.get(reservation.owner_id) ?? [];
    rows.push(reservation);
    byOwner.set(reservation.owner_id, rows);
  }
  return {
    range,
    complete: true,
    entries: events.map((event) => {
      const summary = privateEventSummary(event);
      if (!summary.requestedTime)
        throw new MedusaError(MedusaError.Types.INVALID_DATA, 'Calendar event has invalid timing.');
      return {
        ...summary,
        displayTime: summary.requestedTime,
        protectedTime: (byOwner.get(event.id) ?? []).map((r) => ({
          start: new Date(r.starts_at).toISOString(),
          end: new Date(r.ends_at).toISOString(),
          state: r.state as 'held' | 'confirmed',
        })),
      };
    }),
  };
}
