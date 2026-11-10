import { DateTime } from 'luxon';
import type { CalendarEntry } from '../../../../lib/chef-workspace/contracts';

export type RBCEvent = {
  id: string;
  title: string;
  start: Date;
  end: Date;
  resource: CalendarEntry;
};
export function workspaceEntryToRbc(entry: CalendarEntry): RBCEvent {
  const time = DateTime.fromISO(entry.displayTime.start).toFormat('h:mm a');
  const label = entry.status === 'pending' ? ' · Pending request' : '';
  return {
    id: entry.id,
    title: `${time} ${entry.title}${label}`,
    start: new Date(entry.displayTime.start),
    end: new Date(entry.displayTime.end),
    resource: entry,
  };
}
export function workspaceEntryTooltip(entry: CalendarEntry): string {
  const protection = entry.protectedTime.length
    ? entry.protectedTime
        .map((time) => {
          const start = DateTime.fromISO(time.start).setZone(entry.timeZone).toFormat('MMM d, h:mm a ZZZZ');
          const end = DateTime.fromISO(time.end).setZone(entry.timeZone).toFormat('MMM d, h:mm a ZZZZ');
          return `Protected time (${time.state}): ${start} – ${end}`;
        })
        .join('\n')
    : 'No active protected time';
  const displayStart = DateTime.fromISO(entry.displayTime.start).setZone(entry.timeZone).toFormat('MMM d, h:mm a ZZZZ');
  const displayEnd = DateTime.fromISO(entry.displayTime.end).setZone(entry.timeZone).toFormat('MMM d, h:mm a ZZZZ');
  const label = entry.appointmentTime ? 'Appointment' : 'Requested time';
  return `${entry.title} · ${entry.status}\n${label}: ${displayStart} – ${displayEnd}\n${protection}`;
}
