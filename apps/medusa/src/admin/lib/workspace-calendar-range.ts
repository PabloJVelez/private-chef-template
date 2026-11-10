import { DateTime } from 'luxon';
import type { TimeInterval } from '../../lib/chef-workspace/contracts';
import { localizer } from './calendar-localizer';

export const AGENDA_LENGTH = 30;
/** Use the installed RBC localizer's actual padding (including its week-start
 * convention). Agenda includes the end date. Calendar-day arithmetic preserves DST. */
export function workspaceCalendarRange(date: Date, view: 'month' | 'agenda'): TimeInterval {
  const calendar = localizer as typeof localizer & {
    firstVisibleDay(date: Date): Date;
    lastVisibleDay(date: Date): Date;
  };
  const start = DateTime.fromJSDate(view === 'month' ? calendar.firstVisibleDay(date) : date).startOf('day');
  const last =
    view === 'month'
      ? DateTime.fromJSDate(calendar.lastVisibleDay(date)).startOf('day')
      : start.plus({ days: AGENDA_LENGTH });
  return { start: start.toUTC().toISO()!, end: last.plus({ days: 1 }).toUTC().toISO()! };
}
