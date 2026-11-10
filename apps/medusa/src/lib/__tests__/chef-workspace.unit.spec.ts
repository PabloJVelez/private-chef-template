import { DateTime, Settings } from 'luxon';
import { privateEventSummary } from '../chef-workspace/private-event';
import { workspaceCalendarRange, AGENDA_LENGTH } from '../../admin/lib/workspace-calendar-range';
import { localizer } from '../../admin/lib/calendar-localizer';
import { workspaceEntryToRbc, workspaceEntryTooltip } from '../../admin/routes/chef-events/components/event-adapter';
import { AdminChefWorkspaceResource } from '../../sdk/admin/admin-chef-workspace';
import { requestQuery, calendarQuery, parseQuery } from '../chef-workspace/query';
const Month = require('react-big-calendar/lib/Month').default;
const Agenda = require('react-big-calendar/lib/Agenda').default;

it.each(['2027-03-14', '2027-11-07', '2026-02-01', '2026-08-15'])(
  'matches the installed calendar month/agenda boundaries including DST at %s',
  (date) => {
    const prior = Settings.defaultZone;
    Settings.defaultZone = 'America/Chicago';
    try {
      const day = DateTime.fromISO(date).toJSDate();
      for (const view of ['month', 'agenda'] as const) {
        const expected = (view === 'month' ? Month : Agenda).range(day, { localizer, length: AGENDA_LENGTH });
        const result = workspaceCalendarRange(day, view);
        expect(Date.parse(result.start)).toBe(DateTime.fromJSDate(expected.start).startOf('day').toMillis());
        expect(Date.parse(result.end)).toBe(
          DateTime.fromJSDate(expected.end).startOf('day').plus({ days: 1 }).toMillis(),
        );
      }
      const range = workspaceCalendarRange(day, 'agenda');
      if (date === '2027-03-14') expect((Date.parse(range.end) - Date.parse(range.start)) / 3600000).toBe(31 * 24 - 1);
      if (date === '2027-11-07') expect((Date.parse(range.end) - Date.parse(range.start)) / 3600000).toBe(31 * 24 + 1);
    } finally {
      Settings.defaultZone = prior;
    }
  },
);
const source = {
  id: 'evt_AB',
  status: 'pending' as const,
  firstName: 'Test',
  lastName: 'Guest',
  eventType: 'dinner',
  requestedDate: '2027-03-14T08:30:00Z',
  estimatedDuration: 90,
  timeZone: 'America/Chicago',
};
it('maps stable source IDs and detail URLs, keeps original instants and never dates unscheduled records', () => {
  const summary = privateEventSummary(source);
  expect(summary).toMatchObject({
    id: 'private-event:evt_AB',
    source: { type: 'private-event', id: 'evt_AB' },
    detailPath: '/chef-events/evt_AB',
    appointmentTime: null,
    requestedTime: { start: '2027-03-14T08:30:00.000Z', end: '2027-03-14T10:00:00.000Z' },
  });
  expect(privateEventSummary({ ...source, requestedDate: null }).requestedTime).toBeNull();
  expect(privateEventSummary({ ...source, requestedDate: 'invalid' }).requestedTime).toBeNull();
  expect(privateEventSummary({ ...source, status: 'confirmed' }).appointmentTime).toEqual(summary.requestedTime);
  const entry = { ...summary, displayTime: summary.requestedTime!, protectedTime: [] };
  const rbc = workspaceEntryToRbc(entry);
  expect(rbc.start.toISOString()).toBe('2027-03-14T08:30:00.000Z');
  expect(rbc.title).toBe(`${DateTime.fromISO(source.requestedDate).toFormat('h:mm a')} Test Guest · Pending request`);
  expect(workspaceEntryTooltip(entry)).toContain('Mar 14, 3:30 AM CDT');
  expect(workspaceEntryTooltip(entry)).toContain('No active protected time');
  expect(
    workspaceEntryTooltip({
      ...entry,
      protectedTime: [{ start: '2027-03-14T08:00:00Z', end: '2027-03-14T11:00:00Z', state: 'held' }],
    }),
  ).toContain('Protected time (held)');
});
it('validates paging and bounded offset-aware ranges', () => {
  expect(parseQuery(requestQuery, {})).toMatchObject({ limit: 20, offset: 0 });
  expect(parseQuery(requestQuery, { statuses: ['pending,confirmed', 'pending'] }).statuses).toEqual([
    'pending',
    'confirmed',
  ]);
  for (const limit of [null, true, ['1'], '', '1e1']) expect(() => parseQuery(requestQuery, { limit })).toThrow();
  for (const query of [{ limit: 0 }, { limit: 101 }, { offset: -1 }, { statuses: 'future' }])
    expect(() => parseQuery(requestQuery, query)).toThrow();
  expect(() => parseQuery(calendarQuery, { start: '2027-01-01', end: '2027-02-01' })).toThrow();
});
it('separates list pagination from calendar completeness, and propagates network and incomplete errors', async () => {
  const fetch = jest.fn().mockResolvedValue({ entries: [], complete: true });
  const sdk = new AdminChefWorkspaceResource({ fetch } as any);
  const range = { start: '2027-03-14T06:00:00Z', end: '2027-03-15T05:00:00Z' };
  await sdk.requests({ limit: 20, offset: 1000, statuses: ['completed', 'pending'] });
  expect(fetch).toHaveBeenLastCalledWith(
    '/admin/chef-workspace/requests',
    expect.objectContaining({ method: 'GET', query: { limit: 20, offset: 1000, statuses: 'pending,completed' } }),
  );
  await expect(sdk.calendar(range)).resolves.toMatchObject({ entries: [], complete: true });
  expect(fetch).toHaveBeenLastCalledWith(
    '/admin/chef-workspace/calendar',
    expect.objectContaining({ method: 'GET', query: range, signal: expect.any(AbortSignal) }),
  );
  fetch.mockResolvedValueOnce({ complete: false, entries: [] });
  await expect(sdk.calendar(range)).rejects.toThrow('Too many events');
  fetch.mockRejectedValueOnce(new Error('Timeout'));
  await expect(sdk.calendar(range)).rejects.toThrow('Timeout');
});
