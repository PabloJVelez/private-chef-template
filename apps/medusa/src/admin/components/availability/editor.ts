import { DateTime } from 'luxon';
import { availabilitySettingsSchema, type Settings } from '../../../lib/availability/slots';

export type Hours = { start: string; end: string }[];
export const dayNames = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
export const emptySettings = (): Settings => ({
  timezone: '',
  version: 0,
  weekly: {},
  overrides: {},
  google_mode: 'required',
  notice_rules: [],
});
export const cloneHours = (hours: Hours): Hours => hours.map((window) => ({ ...window }));
export function cleanSettings(value: Settings): Settings {
  return {
    timezone: value.timezone,
    ...(value.version !== undefined ? { version: value.version } : {}),
    ...(value.meal_prep !== undefined ? { meal_prep: value.meal_prep } : {}),
    weekly: value.weekly,
    overrides: value.overrides,
    google_mode: value.google_mode,
    ...(value.notice_rules !== undefined ? { notice_rules: value.notice_rules } : {}),
  };
}
/** Add independent schedules without overwriting any configured day. */
export function addWorkingDays<T extends Pick<Settings, 'weekly'>>(settings: T, targets: string[], hours: Hours): T {
  const selected = [...new Set(targets)];
  if (!selected.length) throw new Error('Select at least one day.');
  if (selected.some((day) => !/^[1-7]$/.test(day))) throw new Error('Choose valid weekdays.');
  if (selected.some((day) => settings.weekly[day as '1']?.length))
    throw new Error('A selected day already has hours. Use Copy to other days to replace them.');
  if (!hours.length || !validHours(hours)) throw new Error('Enter valid hours before adding days.');
  const weekly = { ...settings.weekly };
  selected.forEach((day) => {
    weekly[day as '1'] = cloneHours(hours);
  });
  return { ...settings, weekly };
}
export function copyDays<T extends Pick<Settings, 'weekly'>>(settings: T, source: string, targets: string[], replace: boolean): T {
  const hours = settings.weekly[source as '1'] || [];
  if (!hours.length || !validHours(hours)) throw new Error('Enter valid hours on the source day first.');
  const selected = [...new Set(targets)].filter((day) => day !== source);
  if (!selected.length) throw new Error('Select at least one day.');
  if (!replace && selected.some((day) => settings.weekly[day as '1']?.length))
    throw new Error('Confirm replacement of existing hours before copying.');
  const weekly = { ...settings.weekly };
  selected.forEach((day) => {
    weekly[day as '1'] = cloneHours(hours);
  });
  return { ...settings, weekly };
}
export function dateRange(start: string, end: string): string[] {
  const first = DateTime.fromISO(start, { zone: 'UTC' });
  const last = DateTime.fromISO(end, { zone: 'UTC' });
  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(start) ||
    !/^\d{4}-\d{2}-\d{2}$/.test(end) ||
    !first.isValid ||
    !last.isValid ||
    last < first
  )
    throw new Error('Choose a valid date or an end date on or after the start.');
  const count = last.diff(first, 'days').days + 1;
  if (count > 366) throw new Error('Choose a range of at most 366 dates.');
  return Array.from({ length: count }, (_, index) => first.plus({ days: index }).toISODate()!);
}
export function applyException(
  settings: Settings,
  dates: string[],
  hours: Hours,
  replace: boolean,
): Settings {
  if (!validHours(hours)) throw new Error('Check the special hours before applying.');
  if (!replace && dates.some((date) => date in settings.overrides))
    throw new Error('These dates already have exceptions. Confirm replacement to continue.');
  const overrides = { ...settings.overrides };
  dates.forEach((date) => {
    overrides[date] = cloneHours(hours);
  });
  if (Object.keys(overrides).length > 366)
    throw new Error('You can save exceptions for at most 366 dates. Remove older exceptions first.');
  return { ...settings, overrides };
}
export function validHours(hours: Hours) {
  return availabilitySettingsSchema.shape.weekly.safeParse({ '1': hours }).success;
}
export function hoursError(hours: Hours): string {
  return validHours(hours)
    ? ''
    : 'Enter complete times, with the end after the start and no overlapping hours. Maximum 12 periods; split overnight hours across dates.';
}
