import { DateTime } from 'luxon';
import type { EventInput } from '@fullcalendar/core' with { 'resolution-mode': 'import' };
import type { CalendarEntry } from '../../../../lib/chef-workspace/contracts';

/** Only presentation metadata crosses into FullCalendar; native details own writes. */
export function workspaceEntryToCalendar(entry: CalendarEntry): EventInput {
  return {
    id: entry.id,
    title: entry.title,
    start: entry.displayTime.start,
    end: entry.displayTime.end,
    allDay: false,
    editable: false,
    classNames: [`workspace-event-${entry.status}`],
    extendedProps: { entry },
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
