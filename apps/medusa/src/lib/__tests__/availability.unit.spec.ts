import { googleStartInstant } from '../google-calendar/incremental-sync';
import { DateTime } from 'luxon';
import { availabilitySettingsSchema, calculateSlots, overlaps, type Settings } from '../availability/slots';
import { wallClockToUtcJsDate } from '../chef-event-wall-clock';
const settings: Settings = {
  timezone: 'America/New_York',
  weekly: { '7': [{ start: '00:00', end: '05:00' }] },
  overrides: {},
  google_mode: 'internal_only',
};
const exp = { duration_minutes: 30, time_slot_interval_minutes: 30, requires_advance_notice: false };
const slots = (date: string, s = settings, e = exp, busy: { start: string; end: string }[] = []) =>
  calculateSlots(date, s, e, busy, DateTime.fromISO(date).minus({ days: 1 }));
describe('chef availability', () => {
  it('skips nonexistent spring times instead of normalizing them', () => {
    expect(wallClockToUtcJsDate('2027-03-14', '02:30', settings.timezone)).toBeNull();
    const result = slots('2027-03-14');
    expect(result.some((s) => s.time.startsWith('02:'))).toBe(false);
    expect(result.some((s) => s.time === '03:00')).toBe(true);
  });
  it('preserves explicit Google fold offsets and rejects ambiguous wall clocks without an offset', () => {
    expect(googleStartInstant('2026-11-01T01:30:00-05:00')?.toISOString()).toBe('2026-11-01T06:30:00.000Z');
    expect(googleStartInstant('2026-11-01T01:30:00-04:00')?.toISOString()).toBe('2026-11-01T05:30:00.000Z');
    expect(wallClockToUtcJsDate('2026-11-01', '01:30', settings.timezone)).toBeNull();
  });
  it('returns distinct UTC identifiers and offsets for repeated autumn times', () => {
    const repeated = slots('2026-11-01').filter((s) => s.time === '01:30');
    expect(repeated).toHaveLength(2);
    expect(new Set(repeated.map((s) => s.start)).size).toBe(2);
    expect(repeated[0].label).not.toBe(repeated[1].label);
  });
  it('date closures and open overrides replace weekly hours', () => {
    expect(slots('2026-11-01', { ...settings, overrides: { '2026-11-01': [] } })).toEqual([]);
    expect(
      slots('2026-11-02', { ...settings, overrides: { '2026-11-02': [{ start: '10:00', end: '11:00' }] } }).map(
        (s) => s.time,
      ),
    ).toEqual(['10:00', '10:30']);
    expect(slots('2026-11-02')).toEqual([]);
  });
  it('fits off-site prep, travel each way, duration and cleanup inside working hours', () => {
    const schedule = { ...settings, overrides: { '2026-11-02': [{ start: '09:00', end: '13:00' }] } };
    const result = slots('2026-11-02', schedule, {
      ...exp,
      duration_minutes: 60,
      preparation_minutes: 30,
      travel_minutes: 30,
      cleanup_minutes: 30,
    } as typeof exp);
    expect(result.map((s) => s.time)).toEqual(['10:00', '10:30', '11:00']);
    expect(result[0].occupiedStart).toBe('2026-11-02T14:00:00.000Z');
    expect(result[0].occupiedEnd).toBe('2026-11-02T17:00:00.000Z');
  });
  it('allows adjacency but subtracts any overlapping internal or external busy interval', () => {
    expect(
      overlaps(
        { start: '2026-11-02T10:00Z', end: '2026-11-02T11:00Z' },
        { start: '2026-11-02T11:00Z', end: '2026-11-02T12:00Z' },
      ),
    ).toBe(false);
    const schedule = { ...settings, timezone: 'UTC', overrides: { '2026-11-02': [{ start: '10:00', end: '12:00' }] } };
    expect(
      slots('2026-11-02', schedule, exp, [{ start: '2026-11-02T10:15Z', end: '2026-11-02T11:00Z' }]).map((s) => s.time),
    ).toEqual(['11:00', '11:30']);
  });
  it('enforces centralized notice, horizon and explicit slots', () => {
    const now = DateTime.fromISO('2026-10-31T12:00Z');
    expect(
      calculateSlots(
        '2026-11-01',
        { ...settings, notice_rules: [{ enabled: true, days: 7, scope: 'all', experience_ids: [] }] },
        exp,
        [],
        now,
      ),
    ).toEqual([]);
    expect(calculateSlots('2027-05-02', settings, exp, [], now)).toEqual([]);
    expect(
      slots('2026-11-01', settings, { ...exp, available_time_slots: ['03:00'] } as typeof exp).map((s) => s.time),
    ).toEqual(['03:00']);
  });
  it('rejects invalid configuration and dates; invents no working hours', () => {
    expect(availabilitySettingsSchema.safeParse({ ...settings, timezone: 'Mars/City' }).success).toBe(false);
    expect(
      availabilitySettingsSchema.safeParse({ ...settings, weekly: { '1': [{ start: '20:00', end: '10:00' }] } })
        .success,
    ).toBe(false);
    expect(() => slots('2026-02-30')).toThrow();
    expect(() => slots('2026-11-01', settings, { ...exp, duration_minutes: 0 })).toThrow();
    expect(slots('2026-11-01', { ...settings, weekly: {} })).toEqual([]);
  });
});
