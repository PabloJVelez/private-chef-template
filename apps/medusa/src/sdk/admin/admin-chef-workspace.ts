import type { Client } from '@medusajs/js-sdk';
import type { CalendarResult, RequestPage } from '../../lib/chef-workspace/contracts';
import type { AdminListChefEventsQuery } from './admin-chef-events';
import { sortCalendarStatuses } from '../../lib/chef-event-calendar-status-params';

export type WorkspaceCalendarQuery = Omit<AdminListChefEventsQuery, 'limit' | 'offset'> & {
  start: string;
  end: string;
};
function params(query: AdminListChefEventsQuery | WorkspaceCalendarQuery) {
  const { statuses, ...rest } = query;
  return { ...rest, ...(statuses?.length ? { statuses: sortCalendarStatuses(statuses).join(',') } : {}) };
}
/** Summary reads only. Detail and commands stay on admin.chefEvents. */
export class AdminChefWorkspaceResource {
  constructor(private client: Client) {}
  requests(query: AdminListChefEventsQuery = {}) {
    return this.client.fetch<RequestPage>('/admin/chef-workspace/requests', { method: 'GET', query: params(query) });
  }
  async calendar(query: WorkspaceCalendarQuery, signal?: AbortSignal) {
    const result = await this.client.fetch<CalendarResult>('/admin/chef-workspace/calendar', {
      method: 'GET',
      query: params(query),
      signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(15000)]) : AbortSignal.timeout(15000),
    });
    if (!result.complete) throw new Error('Too many events in this range. Narrow the date range or status filter.');
    return result;
  }
}
