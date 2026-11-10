import { useQuery } from '@tanstack/react-query';
import { sdk } from '../../sdk';
import type { AdminListChefEventsQuery } from '../../sdk/admin/admin-chef-events';
import type { WorkspaceCalendarQuery } from '../../sdk/admin/admin-chef-workspace';

// Existing event mutations already invalidate this prefix, including these read projections.
export function useAdminWorkspaceRequests(query: AdminListChefEventsQuery = {}) {
  return useQuery({
    queryKey: ['chef-events', 'workspace-requests', query],
    queryFn: () => sdk.admin.chefWorkspace.requests(query),
  });
}
export function useAdminWorkspaceCalendar(query: WorkspaceCalendarQuery) {
  return useQuery({
    queryKey: ['chef-events', 'workspace-calendar', query],
    // Never carry entries from another range/filter forward while this range loads.
    queryFn: ({ signal }) => sdk.admin.chefWorkspace.calendar(query, signal),
    retry: false,
  });
}
