/**
 * @jest-environment jsdom
 * @jest-environment-options {"customExportConditions":["node","node-addons"]}
 */
import { DateTime } from 'luxon';
// @ts-expect-error FullCalendar 6 exposes CJS runtime with ESM declarations (TS 5.7 NodeNext).
import { Calendar } from '@fullcalendar/core';
// @ts-expect-error FullCalendar 6 exposes CJS runtime with ESM declarations (TS 5.7 NodeNext).
import dayGridPlugin from '@fullcalendar/daygrid';
// @ts-expect-error FullCalendar 6 exposes CJS runtime with ESM declarations (TS 5.7 NodeNext).
import timeGridPlugin from '@fullcalendar/timegrid';
// @ts-expect-error FullCalendar 6 exposes CJS runtime with ESM declarations (TS 5.7 NodeNext).
import listPlugin from '@fullcalendar/list';
import { workspaceCalendarRange, AGENDA_DAYS, CALENDAR_VIEWS } from '../../admin/lib/workspace-calendar-range';
it.each([
  ['2026-11-10', 'month', '2026-11-01', '2026-12-06'],
  ['2026-02-01', 'month', '2026-02-01', '2026-03-01'],
  ['2026-08-15', 'month', '2026-07-26', '2026-09-06'],
  ['2027-03-14', 'day', '2027-03-14', '2027-03-15'],
  ['2027-11-07', 'day', '2027-11-07', '2027-11-08'],
  ['2027-03-14', 'agenda', '2027-03-14', '2027-04-14'],
  ['2027-11-07', 'agenda', '2027-11-07', '2027-12-08'],
] as const)('reads exact visible boundaries for %s %s, with exclusive end', (date, view, start, end) => {
  const host = document.createElement('div');
  document.body.appendChild(host);
  let actual: ReturnType<typeof workspaceCalendarRange> | undefined;
  const calendar = new Calendar(host, {
    plugins: [dayGridPlugin, timeGridPlugin, listPlugin],
    initialDate: date, initialView: CALENDAR_VIEWS[view], timeZone: 'local',
    firstDay: 0, fixedWeekCount: false,
    views: { workspaceAgenda: { type: 'list', duration: { days: AGENDA_DAYS } } },
    datesSet: (info) => { actual = workspaceCalendarRange(info); },
  });
  try {
    calendar.render();
    expect(actual).toEqual({
      key: `${view}:${view === 'month' ? date.slice(0, 7) : date}`,
      start: DateTime.fromISO(start).toUTC().toISO(),
      end: DateTime.fromISO(end).toUTC().toISO(),
    });
    if (date === '2026-11-10') {
      expect(host.querySelector('[data-date="2026-11-29"]')).not.toBeNull();
      expect(host.querySelector('[data-date="2026-11-30"]')).not.toBeNull();
      expect(host.querySelector('[data-date="2026-10-18"]')).toBeNull();
    }
  } finally { calendar.destroy(); host.remove(); }
});
