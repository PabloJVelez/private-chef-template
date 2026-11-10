import type { RequestSummary } from './contracts';
import { resolveChefEventDisplayZone } from '../chef-event-datetime-display';

/** Explicit allowlist shared by native list and calendar query. No contact/address/notes payloads. */
export const summaryFields = [
  'id',
  'status',
  'requestedDate',
  'estimatedDuration',
  'timeZone',
  'firstName',
  'lastName',
  'eventType',
] as const;
export type PrivateEventRead = {
  id: string;
  status: RequestSummary['status'];
  requestedDate: string | Date | null;
  estimatedDuration?: number | null;
  timeZone?: string | null;
  firstName: string;
  lastName: string;
  eventType: string;
};
export function privateEventSummary(event: PrivateEventRead): RequestSummary {
  const start = event.requestedDate ? new Date(event.requestedDate).getTime() : NaN;
  // Preserve the calendar's existing 60-minute display estimate for legacy records.
  // This is never a reservation or a new date for an unscheduled record.
  const minutes = Number(event.estimatedDuration ?? 60);
  const requestedTime =
    Number.isFinite(start) && Number.isFinite(minutes) && minutes >= 0
      ? { start: new Date(start).toISOString(), end: new Date(start + minutes * 60000).toISOString() }
      : null;
  return {
    id: `private-event:${event.id}`,
    source: { type: 'private-event', id: event.id },
    detailPath: `/chef-events/${encodeURIComponent(event.id)}`,
    title: [event.firstName, event.lastName].filter(Boolean).join(' ').trim() || 'Untitled',
    category: event.eventType,
    status: event.status,
    requestedTime,
    appointmentTime: event.status === 'confirmed' || event.status === 'completed' ? requestedTime : null,
    timeZone: resolveChefEventDisplayZone(event),
  };
}
