import { DateTime } from 'luxon';
import type { DatesSetArg } from '@fullcalendar/core' with { 'resolution-mode': 'import' };
import type { TimeInterval } from '../../lib/chef-workspace/contracts';

export type CalendarView = 'month' | 'day' | 'agenda';
export const CALENDAR_VIEWS: Record<CalendarView, string> = {
  month: 'dayGridMonth', day: 'timeGridDay', agenda: 'workspaceAgenda',
};
// Preserve existing agenda links: selected day plus 30 more dates.
export const AGENDA_DAYS = 31;
export type VisibleCalendarRange = TimeInterval & { key: string };
export function calendarRangeKey(date: Date, view: CalendarView): string {
  const day = DateTime.fromJSDate(date);
  return `${view}:${view === 'month' ? day.toFormat('yyyy-MM') : day.toISODate()}`;
}
/** FullCalendar owns the visible interval. Its end is already exclusive;
 * never add 24 hours or reconstruct month padding with another localizer. */
export function workspaceCalendarRange(info: DatesSetArg): VisibleCalendarRange {
  const view = (Object.keys(CALENDAR_VIEWS) as CalendarView[]).find((key) => CALENDAR_VIEWS[key] === info.view.type)!;
  return {
    key: calendarRangeKey(info.view.currentStart, view),
    start: info.start.toISOString(),
    end: info.end.toISOString(),
  };
}
