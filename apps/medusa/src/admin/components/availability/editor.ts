import { DateTime } from 'luxon';
import { availabilitySettingsSchema, type Settings } from '../../../lib/availability/slots';

export type Hours = { start: string; end: string }[];
export const dayNames = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
export const emptySettings = (): Settings => ({ timezone: '', weekly: {}, overrides: {}, google_mode: 'required' });
export const cloneHours = (hours: Hours): Hours => hours.map((window) => ({ ...window }));
export const equalSettings = (a: Settings | null, b: Settings) => JSON.stringify(a) === JSON.stringify(b);
export function cleanSettings(value: Settings): Settings {
  return { timezone: value.timezone, weekly: value.weekly, overrides: value.overrides, google_mode: value.google_mode };
}
export type EditorState = {
  initialized: boolean;
  draft: Settings;
  saved: Settings | null;
  remembered: Record<string, Hours>;
  saving: { id: number; snapshot: Settings } | null;
  error: string;
};
export const initialEditor = (): EditorState => ({
  initialized: false,
  draft: emptySettings(),
  saved: null,
  remembered: {},
  saving: null,
  error: '',
});
export type EditorAction =
  | { type: 'receive'; settings: Settings | null }
  | { type: 'edit'; settings: Settings }
  | { type: 'toggle'; day: string; enabled: boolean }
  | { type: 'discard' }
  | { type: 'saving'; id: number; snapshot: Settings }
  | { type: 'saved'; id: number; settings: Settings }
  | { type: 'failed'; id: number; message: string };
export function editorReducer(state: EditorState, action: EditorAction): EditorState {
  switch (action.type) {
    case 'receive':
      if (state.initialized) return state; // Refetches must never replace local work.
      return {
        ...state,
        initialized: true,
        saved: action.settings && cleanSettings(action.settings),
        draft: action.settings ? cleanSettings(action.settings) : emptySettings(),
      };
    case 'edit':
      return { ...state, draft: action.settings, error: '' };
    case 'toggle': {
      const hours = state.draft.weekly[action.day as '1'] || [];
      return {
        ...state,
        remembered: hours.length ? { ...state.remembered, [action.day]: cloneHours(hours) } : state.remembered,
        draft: {
          ...state.draft,
          weekly: {
            ...state.draft.weekly,
            [action.day]: action.enabled ? cloneHours(state.remembered[action.day] || [{ start: '', end: '' }]) : [],
          },
        },
      };
    }
    case 'discard':
      return state.saving ? state : { ...state, draft: state.saved || emptySettings(), remembered: {}, error: '' };
    case 'saving':
      return { ...state, saving: { id: action.id, snapshot: action.snapshot }, error: '' };
    case 'saved': {
      if (state.saving?.id !== action.id) return state;
      const saved = cleanSettings(action.settings);
      return {
        ...state,
        saved,
        draft: equalSettings(state.saving.snapshot, state.draft) ? saved : state.draft,
        saving: null,
        error: '',
      };
    }
    case 'failed':
      return state.saving?.id === action.id ? { ...state, saving: null, error: action.message } : state;
  }
}
export function copyDays(settings: Settings, source: string, targets: string[], replace: boolean): Settings {
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
export function applyException(settings: Settings, dates: string[], hours: Hours, replace: boolean): Settings {
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
