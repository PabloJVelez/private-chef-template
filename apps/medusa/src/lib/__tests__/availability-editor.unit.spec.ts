import {
  applyException,
  addWorkingDays,
  copyDays,
  dateRange,
  validHours,
} from '../../admin/components/availability/editor';
import type { Settings } from '../availability/slots';
const hours = [
  { start: '10:00', end: '12:00' },
  { start: '14:00', end: '20:00' },
];
const settings = (): Settings => ({
  timezone: 'America/Chicago',
  weekly: { '1': hours, '2': [{ start: '08:00', end: '11:00' }] },
  overrides: { '2026-11-01': hours },
  google_mode: 'required',
});
test('copy preserves split periods and requires explicit replacement of populated days', () => {
  const original = settings();
  expect(() => copyDays(original, '1', ['2', '3'], false)).toThrow('Confirm replacement');
  expect(original.weekly['2']![0].start).toBe('08:00');
  const copied = copyDays(original, '1', ['2', '3'], true);
  expect(copied.weekly['2']).toEqual(hours);
  expect(copied.weekly['3']).not.toBe(hours);
});

test('date ranges survive DST and reject invalid or excessive dates', () => {
  expect(dateRange('2026-10-31', '2026-11-02')).toEqual(['2026-10-31', '2026-11-01', '2026-11-02']);
  expect(dateRange('2026-03-07', '2026-03-09')).toHaveLength(3);
  expect(() => dateRange('2026-02-30', '2026-03-01')).toThrow();
  expect(() => dateRange('2026-11-02', '2026-11-01')).toThrow();
  expect(() => dateRange('2026-01-01', '2027-01-02')).toThrow('366');
});
test('duplicate and overlapping exceptions cannot silently replace custom hours', () => {
  const original = settings();
  expect(() => applyException(original, ['2026-11-01'], [], false)).toThrow('already have exceptions');
  const dates = dateRange('2026-10-31', '2026-11-02');
  expect(() => applyException(original, dates, [], false)).toThrow();
  expect(applyException(original, dates, [], true).overrides['2026-11-01']).toEqual([]);
  expect(original.overrides['2026-11-01']).toEqual(hours);
  const full = applyException({ ...original, overrides: {} }, dateRange('2026-01-01', '2027-01-01'), [], false);
  expect(() => applyException(full, ['2027-01-02'], [], false)).toThrow('366');
});
test('hour constraints allow touching but reject overlap, overnight, incomplete and excess periods', () => {
  expect(
    validHours([
      { start: '10:00', end: '12:00' },
      { start: '12:00', end: '14:00' },
    ]),
  ).toBe(true);
  for (const rows of [
    [{ start: '10:00', end: '24:00' }],
    [{ start: '23:00', end: '01:00' }],
    [{ start: '', end: '' }],
    [
      { start: '10:00', end: '12:00' },
      { start: '11:00', end: '13:00' },
    ],
    Array(13).fill({ start: '10:00', end: '11:00' }),
  ])
    expect(validHours(rows)).toBe(false);
});



test('multi-day add rejects duplicates without overwriting and clones every range', () => {
  const original = settings();
  expect(() => addWorkingDays(original, ['1', '3'], hours)).toThrow('already has hours');
  expect(() => addWorkingDays(original, [], hours)).toThrow('Select');
  expect(() => addWorkingDays(original, ['8'], hours)).toThrow('valid weekdays');
  expect(() => addWorkingDays(original, ['3'], [])).toThrow('valid hours');
  const next = addWorkingDays(original, ['3', '4', '3'], hours);
  expect(next.weekly['3']).toEqual(hours);
  next.weekly['3']![0].start = '10:30';
  expect(next.weekly['4']![0].start).toBe('10:00');
  expect(original.weekly['1']![0].start).toBe('10:00');
});
