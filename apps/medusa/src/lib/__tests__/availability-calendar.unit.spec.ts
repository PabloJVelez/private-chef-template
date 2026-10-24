import { DateTime, Settings as LuxonSettings } from 'luxon';
import { availableCalendar, availableSlots, requireSlot } from '../availability/query';
import { googleBusy } from '../availability/google-busy';
import type { Settings } from '../availability/slots';
import { GET } from '../../api/store/availability/calendar/route';
jest.mock('../availability/google-busy', () => ({ googleBusy: jest.fn() }));
const lookup = jest.mocked(googleBusy);
let settings: Settings;
let experience: any;
let events: any[];
const listEvents = jest.fn(async () => events);
const maps = jest.fn(async () => [] as any[]);
const google = { getPrimaryConnection: jest.fn(async (): Promise<any> => ({ id: 'connection' })), listGoogleCalendarSyncMaps: maps };
const container: any = {
  resolve: (key: string) =>
    ({
      availability: { listAvailabilitySettings: async () => [settings] },
      experienceTypeModuleService: { retrieveExperienceType: async () => experience },
      chefEventModuleService: { listChefEvents: listEvents },
      googleCalendarConnectionModuleService: google,
    })[key],
};
beforeEach(() => {
  LuxonSettings.now = () => Date.parse('2026-10-30T12:00:00Z');
  settings = {
    timezone: 'America/New_York',
    weekly: {},
    overrides: {
      '2026-11-01': [{ start: '00:00', end: '04:00' }],
      '2026-11-02': [{ start: '09:00', end: '13:00' }],
    },
    google_mode: 'required',
  };
  experience = { is_active: true, duration_minutes: 60, time_slot_interval_minutes: 30 };
  events = [];
  jest.clearAllMocks();
  lookup.mockResolvedValue([]);
  google.getPrimaryConnection.mockResolvedValue({ id: 'connection' });
});
afterEach(() => {
  LuxonSettings.now = () => Date.now();
});
test('month summary shares one Google/internal read, follows open overrides, and exposes no event details', async () => {
  const result = await availableCalendar(container, 'exp', '2026-11');
  expect(result.dates).toHaveLength(30);
  expect(result.dates.filter((d) => d.available).map((d) => d.date)).toEqual(['2026-11-01', '2026-11-02']);
  expect(lookup).toHaveBeenCalledTimes(1);
  expect(listEvents).toHaveBeenCalledTimes(1);
  expect(lookup.mock.calls[0].slice(1, 3)).toEqual(['2026-11-01T04:00:00.000Z', '2026-12-01T05:00:00.000Z']);
  expect(Object.keys(result.dates[0])).toEqual(['date', 'available']);
});
test('buffers, Google busy time and accepted bookings remove days; pending requests do not hold', async () => {
  experience = {
    ...experience,
    duration_minutes: 150,
    preparation_minutes: 30,
    travel_minutes: 30,
    cleanup_minutes: 30,
  };
  events = [
    { id: 'pending', status: 'pending' },
    { id: 'accepted', status: 'confirmed', occupiedStart: '2026-11-01T04:00:00Z', occupiedEnd: '2026-11-01T10:00:00Z' },
  ];
  maps.mockResolvedValueOnce([{ connectionId: 'connection', chefEventId: 'pending', googleEventId: 'mirror' }]);
  const result = await availableCalendar(container, 'exp', '2026-11');
  // Four-hour November 2 window cannot fit 4.5 hours of occupancy.
  expect(result.dates.some((d) => d.available)).toBe(false);
  expect(lookup.mock.calls[0][3]).toEqual(new Set(['mirror']));
  experience = { ...experience, duration_minutes: 60, preparation_minutes: 0, travel_minutes: 0, cleanup_minutes: 0 };
  lookup.mockResolvedValue([{ start: '2026-11-02T14:00:00Z', end: '2026-11-02T18:00:00Z' }]);
  expect((await availableCalendar(container, 'exp', '2026-11')).dates.some((d) => d.available)).toBe(false);
});
test('closures replace weekly hours and bounds prevent out-of-range dates or lookups', async () => {
  settings.weekly = { '1': [{ start: '09:00', end: '13:00' }] };
  settings.overrides['2026-11-02'] = [];
  experience.requires_advance_notice = true;
  experience.advance_notice_days = 7;
  const month = await availableCalendar(container, 'exp');
  expect(month.month).toBe('2026-11');
  expect(month.minDate).toBe('2026-11-06');
  expect(month.dates.find((d) => d.date === '2026-11-02')?.available).toBe(false);
  lookup.mockClear();
  expect((await availableCalendar(container, 'exp', '2027-05')).dates.some((d) => d.available)).toBe(false);
  expect(lookup).not.toHaveBeenCalled();
});
test('per-date choices still distinguish DST fold offsets and match the month summary', async () => {
  const day = await availableSlots(container, '2026-11-01', 'exp');
  const repeated = day.slots.filter((s) => s.time === '01:00');
  expect(repeated).toHaveLength(2);
  expect(repeated[0].label).not.toBe(repeated[1].label);
  expect((await availableCalendar(container, 'exp', '2026-11')).dates[0].available).toBe(day.slots.length > 0);
});
test('Google failure keeps internal availability and private errors out of responses; invalid month is rejected', async () => {
  lookup.mockRejectedValue(new Error('private detail'));
  events = [{ id: 'accepted', status: 'confirmed', occupiedStart: '2026-11-02T14:00:00Z', occupiedEnd: '2026-11-02T18:00:00Z' }];
  const result = await availableCalendar(container, 'exp', '2026-11');
  expect(result.dates.find((day) => day.date === '2026-11-01')?.available).toBe(true);
  expect(result.dates.find((day) => day.date === '2026-11-02')?.available).toBe(false);
  const day = await availableSlots(container, '2026-11-01', 'exp');
  await expect(requireSlot(container, '2026-11-01', 'exp', day.slots[0].start)).resolves.toHaveProperty('slot');
  const res: any = { setHeader: jest.fn(), json: jest.fn(), status: jest.fn().mockReturnThis() };
  await GET({ query: { experience_id: 'exp', month: '2026-11' }, scope: container } as any, res);
  expect(res.status).not.toHaveBeenCalledWith(503);
  expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ dates: expect.any(Array) }));
  expect(JSON.stringify(res.json.mock.calls)).not.toContain('private detail');
  lookup.mockClear();
  await GET({ query: { experience_id: 'exp', month: '2026-13' }, scope: container } as any, res);
  expect(res.status).toHaveBeenCalledWith(400);
  expect(lookup).not.toHaveBeenCalled();
});

test('no connection permits monthly, daily and acceptance validation while retaining internal conflicts', async () => {
  google.getPrimaryConnection.mockResolvedValue(null);
  lookup.mockRejectedValue(new Error('must not query Google without a connection'));
  const month = await availableCalendar(container, 'exp', '2026-11');
  expect(month.dates.find((d) => d.date === '2026-11-02')?.available).toBe(true);
  const day = await availableSlots(container, '2026-11-02', 'exp');
  await expect(requireSlot(container, '2026-11-02', 'exp', day.slots[0].start)).resolves.toHaveProperty('slot');
  events = [
    {
      id: 'accepted',
      status: 'confirmed',
      occupiedStart: '2026-11-02T14:00:00Z',
      occupiedEnd: '2026-11-02T18:00:00Z',
    },
  ];
  await expect(requireSlot(container, '2026-11-02', 'exp', day.slots[0].start)).rejects.toThrow('no longer available');
  expect(maps).not.toHaveBeenCalled();
  expect(lookup).not.toHaveBeenCalled();
});
test('connection state lookup failures still allow internal availability', async () => {
  google.getPrimaryConnection.mockRejectedValueOnce(new Error('connection lookup failed'));
  expect((await availableCalendar(container, 'exp', '2026-11')).dates.some((day) => day.available)).toBe(true);
});
test('seven-day notice on October 24 plus weekdays starts November 2; reducing notice opens October', async () => {
  LuxonSettings.now = () => Date.parse('2026-10-24T17:00:00Z');
  settings = {
    timezone: 'America/Chicago',
    google_mode: 'internal_only',
    overrides: {},
    weekly: Object.fromEntries(['1', '2', '3', '4', '5'].map((day) => [day, [{ start: '09:01', end: '21:02' }]])),
  };
  experience = {
    ...experience,
    requires_advance_notice: true,
    advance_notice_days: 7,
  };
  const october = await availableCalendar(container, 'exp', '2026-10');
  expect(october.minDate).toBe('2026-10-31');
  expect(october.dates.some((day) => day.available)).toBe(false);
  const november = await availableCalendar(container, 'exp', '2026-11');
  expect(november.dates.find((day) => day.available)?.date).toBe('2026-11-02');
  experience.advance_notice_days = 0;
  expect((await availableCalendar(container, 'exp', '2026-10')).dates.find((day) => day.available)?.date).toBe(
    '2026-10-26',
  );
});

test('a stalled Google read falls back before the storefront proxy timeout', async () => {
  jest.useFakeTimers({ doNotFake: ['nextTick'] });
  lookup.mockImplementation(() => new Promise(() => {}));
  try {
    const result = availableSlots(container, '2026-11-02', 'exp');
    await jest.advanceTimersByTimeAsync(8001);
    expect((await result).slots.length).toBeGreaterThan(0);
  } finally {
    jest.useRealTimers();
  }
});

test('central notice scope drives month, day, submission and acceptance validation', async () => {
  experience.id = 'exp';
  experience.requires_advance_notice = true;
  experience.advance_notice_days = 30; // Central rules replace legacy values.
  settings.notice_rules = [{ enabled: true, days: 4, scope: 'selected', experience_ids: ['exp'] }];
  expect((await availableCalendar(container, 'exp', '2026-11')).minDate).toBe('2026-11-03');
  expect((await availableSlots(container, '2026-11-02', 'exp')).slots).toEqual([]);
  await expect(requireSlot(container, '2026-11-02', 'exp', '2026-11-02T14:00:00Z')).rejects.toThrow('no longer available');
  // Unselected experiences do not inherit the old hidden rule.
  settings.notice_rules[0].experience_ids = ['other'];
  expect((await availableSlots(container, '2026-11-02', 'exp')).slots.length).toBeGreaterThan(0);
  expect((await availableCalendar(container, 'exp', '2026-11')).minDate).toBe('2026-10-30');
  // All includes newly-created experiences, and overlaps use the longest notice.
  settings.notice_rules.push({ enabled: true, days: 4, scope: 'all', experience_ids: [] });
  experience.id = 'new-experience';
  expect((await availableSlots(container, '2026-11-02', 'new-experience')).slots).toEqual([]);
  settings.notice_rules[1].enabled = false;
  expect((await requireSlot(container, '2026-11-02', 'new-experience', '2026-11-02T14:00:00Z')).slot).toBeDefined();
  settings.notice_rules = [];
  expect((await availableSlots(container, '2026-11-02', 'exp')).slots.length).toBeGreaterThan(0);
});
