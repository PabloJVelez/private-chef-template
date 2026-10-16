import { DateTime } from 'luxon';
import { z } from 'zod';

const clock = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/);
const windowSchema = z
  .object({ start: clock, end: clock })
  .refine((w) => w.start < w.end, 'End must follow start (split overnight windows across dates).');
const windows = z
  .array(windowSchema)
  .max(12)
  .superRefine((rows, ctx) => {
    const sorted = [...rows].sort((a, b) => a.start.localeCompare(b.start));
    if (sorted.some((w, i) => i > 0 && w.start < sorted[i - 1].end))
      ctx.addIssue({ code: 'custom', message: 'Working windows overlap.' });
  });
export const availabilitySettingsSchema = z.object({
  timezone: z.string().refine((zone) => DateTime.now().setZone(zone).isValid, 'Use a valid IANA timezone.'),
  weekly: z.record(z.enum(['1', '2', '3', '4', '5', '6', '7']), windows),
  overrides: z
    .record(
      z
        .string()
        .regex(/^\d{4}-\d{2}-\d{2}$/)
        .refine((d) => DateTime.fromISO(d).isValid),
      windows,
    )
    .refine((v) => Object.keys(v).length <= 366),
  google_mode: z.enum(['required', 'internal_only']),
});
export type Settings = z.infer<typeof availabilitySettingsSchema>;
export type Interval = { start: string; end: string };
export type ExperienceSchedule = {
  duration_minutes?: number | null;
  preparation_minutes?: number;
  travel_minutes?: number;
  cleanup_minutes?: number;
  requires_advance_notice?: boolean;
  advance_notice_days?: number;
  time_slot_interval_minutes?: number;
  available_time_slots?: unknown;
  time_slot_start?: string | null;
  time_slot_end?: string | null;
};
export type Slot = Interval & { time: string; label: string; occupiedStart: string; occupiedEnd: string };
export const overlaps = (a: Interval, b: Interval) =>
  Date.parse(a.start) < Date.parse(b.end) && Date.parse(b.start) < Date.parse(a.end);

/** Enumerate UTC instants: spring gaps vanish and fall folds retain both offset-labelled choices. */
export function calculateSlots(
  date: string,
  settings: Settings,
  experience: ExperienceSchedule,
  busy: Interval[],
  now: DateTime = DateTime.utc(),
): Slot[] {
  const day = DateTime.fromISO(date, { zone: settings.timezone }).startOf('day');
  if (!day.isValid || day.toISODate() !== date) throw new Error('Invalid availability date.');
  const today = now.setZone(settings.timezone).startOf('day');
  const notice = experience.requires_advance_notice ? (experience.advance_notice_days ?? 7) : 0;
  if (day < today.plus({ days: notice }) || day > today.plus({ months: 6 })) return [];
  const duration = Number(experience.duration_minutes);
  const prep = experience.preparation_minutes ?? 0;
  const travel = experience.travel_minutes ?? 0;
  const cleanup = experience.cleanup_minutes ?? 0;
  const interval = experience.time_slot_interval_minutes ?? 30;
  if (
    !Number.isInteger(duration) ||
    duration <= 0 ||
    duration > 1440 ||
    !Number.isInteger(interval) ||
    interval < 5 ||
    interval > 1440 ||
    [prep, travel, cleanup].some((v) => !Number.isInteger(v) || v < 0 || v > 1440)
  )
    throw new Error('Experience scheduling is not configured.');
  // Arrival is the public start. On-site preparation is INCLUDED in duration; prep is off-site only.
  const work = settings.overrides[date] ?? settings.weekly[String(day.weekday) as keyof Settings['weekly']] ?? [];
  if (!work.length) return [];
  const allowed = Array.isArray(experience.available_time_slots) ? (experience.available_time_slots as string[]) : [];
  const result: Slot[] = [];
  for (let start = day; start < day.plus({ days: 1 }); start = start.plus({ minutes: 1 })) {
    const time = start.toFormat('HH:mm');
    if ((start.hour * 60 + start.minute) % interval !== 0 || start <= now) continue;
    if (allowed.length && !allowed.includes(time)) continue;
    if (experience.time_slot_start && time < experience.time_slot_start) continue;
    if (experience.time_slot_end && time > experience.time_slot_end) continue;
    const occupiedStart = start.minus({ minutes: prep + travel });
    const end = start.plus({ minutes: duration });
    const occupiedEnd = end.plus({ minutes: cleanup + travel });
    // Require every occupied minute to be in the SAME working window. No DST wall-time normalization.
    const fits = work.some((w) => {
      for (let t = occupiedStart; t < occupiedEnd; t = t.plus({ minutes: 1 })) {
        if (t.toISODate() !== date || t.toFormat('HH:mm') < w.start || t.toFormat('HH:mm') >= w.end) return false;
      }
      return true;
    });
    if (!fits) continue;
    const occupied = { start: occupiedStart.toUTC().toISO()!, end: occupiedEnd.toUTC().toISO()! };
    if (busy.some((b) => overlaps(occupied, b))) continue;
    result.push({
      start: start.toUTC().toISO()!,
      end: end.toUTC().toISO()!,
      time,
      label: start.toFormat('h:mm a ZZZZ (ZZ)'),
      occupiedStart: occupied.start,
      occupiedEnd: occupied.end,
    });
  }
  return result;
}
