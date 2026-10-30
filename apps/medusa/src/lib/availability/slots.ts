import { DateTime } from 'luxon';
import { z } from 'zod';

const clock = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/);
const windowSchema = z
  .object({ start: clock, end: clock })
  .refine((w) => w.start < w.end, 'End must follow start (split overnight windows across dates).');
export const windows = z
  .array(windowSchema)
  .max(12)
  .superRefine((rows, ctx) => {
    const sorted = [...rows].sort((a, b) => a.start.localeCompare(b.start));
    if (sorted.some((w, i) => i > 0 && w.start < sorted[i - 1].end))
      ctx.addIssue({ code: 'custom', message: 'Working windows overlap.' });
  });
export const noticeRuleSchema = z
  .object({
    enabled: z.boolean(),
    days: z.number().int().min(1, 'Enter at least one whole day.'),
    scope: z.enum(['all', 'selected']),
    experience_ids: z.array(z.string().min(1)),
  })
  .refine(
    (rule) => !rule.enabled || rule.scope === 'all' || rule.experience_ids.length > 0,
    'Select at least one experience.',
  );
export type NoticeRule = z.infer<typeof noticeRuleSchema>;

const methodSchedule = z
  .object({
    enabled: z.boolean(),
    weekly: z.record(z.enum(['1', '2', '3', '4', '5', '6', '7']), windows),
    dates: z
      .record(
        z
          .string()
          .regex(/^\d{4}-\d{2}-\d{2}$/)
          .refine((d) => DateTime.fromISO(d).isValid),
        windows,
      )
      .refine((v) => Object.keys(v).length <= 366),
  })
  .strict();

// Draft inputs only. Neither simultaneous storage nor empty windows establish
// eligibility, closure precedence, location validity, or any fulfillment policy.
export const mealPrepSetupSchema = z
  .object({
    methods: z.object({ in_home: methodSchedule, delivery: methodSchedule, pickup: methodSchedule }).strict(),
    selection_styles: z
      .object({
        individual_dishes: z.boolean(),
        package: z.boolean(),
        chosen_menu: z.boolean(),
        tailored_plan: z.boolean(),
      })
      .strict(),
    delivery_area: z
      .object({
        radius: z
          .object({
            address: z.string().trim().min(1).max(1000),
            distance: z.number().finite().positive(),
            unit: z.enum(['mi', 'km']),
          })
          .strict()
          .nullable(),
        zip_codes: z
          .array(z.string().regex(/^\d{5}(-\d{4})?$/, 'Use a five-digit ZIP or ZIP+4.'))
          .max(5000)
          .refine((v) => new Set(v).size === v.length, 'Remove duplicate ZIP codes.'),
      })
      .strict(),
    work_plans: z
      .array(
        z
          .object({
            id: z.string().min(1).max(100),
            purpose: z.enum(['in_home', 'preparation', 'delivery', 'handoff']),
            start: z.string().datetime({ offset: true }),
            end: z.string().datetime({ offset: true }),
          })
          .strict()
          .refine((v) => Date.parse(v.end) > Date.parse(v.start), 'Work must end after it starts.'),
      )
      .max(366)
      .refine((v) => new Set(v.map((b) => b.id)).size === v.length, 'Work plan IDs must be unique.'),
  })
  .strict();
export type MealPrepSetup = z.infer<typeof mealPrepSetupSchema>;
export const emptyMealPrepSetup = (): MealPrepSetup => ({
  methods: {
    in_home: { enabled: false, weekly: {}, dates: {} },
    delivery: { enabled: false, weekly: {}, dates: {} },
    pickup: { enabled: false, weekly: {}, dates: {} },
  },
  selection_styles: { individual_dishes: false, package: false, chosen_menu: false, tailored_plan: false },
  delivery_area: { radius: null, zip_codes: [] },
  work_plans: [],
});

export const availabilitySettingsSchema = z.object({
  // Optional for legacy read/calculation callers. The HTTP write boundary requires it.
  version: z.number().int().nonnegative().max(2147483646).optional(),
  meal_prep: mealPrepSetupSchema.nullable().optional(),
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
  notice_rules: z.array(noticeRuleSchema).nullable().optional(),
});
export type Settings = z.infer<typeof availabilitySettingsSchema>;
export type Interval = { start: string; end: string };
export type ExperienceSchedule = {
  id?: string;
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
export type Slot = Interval & {
  time: string;
  label: string;
  occupiedStart: string;
  occupiedEnd: string;
};
export const overlaps = (a: Interval, b: Interval) =>
  Date.parse(a.start) < Date.parse(b.end) && Date.parse(b.start) < Date.parse(a.end);

/** Availability is the sole notice authority; absent rules match the admin's off state. */
export function advanceNoticeDays(settings: Settings, experience: ExperienceSchedule): number {
  return Math.max(
    0,
    ...(settings.notice_rules ?? [])
      .filter(
        (rule) => rule.enabled && (rule.scope === 'all' || rule.experience_ids.includes(experience.id ?? '')),
      )
      .map((rule) => rule.days),
  );
}

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
  const notice = advanceNoticeDays(settings, experience);
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
  const work =
    settings.overrides[date] ?? settings.weekly[String(day.weekday) as keyof Settings['weekly']] ?? [];
  if (!work.length) return [];
  const allowed = Array.isArray(experience.available_time_slots)
    ? (experience.available_time_slots as string[])
    : [];
  // Resolve the real timeline once per day. A window can produce multiple runs
  // across a fall-back transition; never merge runs belonging to different windows.
  // This preserves the old every-occupied-minute rule without walking the entire
  // duration again for every arrival (and every day of a calendar request).
  const dayEnd = day.plus({ days: 1 }).toMillis();
  const minutes: { instant: DateTime; wallMinute: number }[] = [];
  for (let millis = day.toMillis(); millis < dayEnd; millis += 60000) {
    const instant = DateTime.fromMillis(millis, { zone: settings.timezone });
    minutes.push({ instant, wallMinute: instant.hour * 60 + instant.minute });
  }
  const clockMinutes = (clock: string) => Number(clock.slice(0, 2)) * 60 + Number(clock.slice(3));
  const runs: { start: number; end: number }[] = [];
  for (const window of work) {
    const from = clockMinutes(window.start), to = clockMinutes(window.end);
    let runStart: number | null = null;
    for (const { instant, wallMinute } of minutes) {
      const inside = wallMinute >= from && wallMinute < to;
      if (inside && runStart === null) runStart = instant.toMillis();
      if (!inside && runStart !== null) {
        runs.push({ start: runStart, end: instant.toMillis() });
        runStart = null;
      }
    }
    if (runStart !== null) runs.push({ start: runStart, end: dayEnd });
  }
  const busyTimes = busy.map((interval) => ({ start: Date.parse(interval.start), end: Date.parse(interval.end) }));
  const result: Slot[] = [];
  for (const { instant: start, wallMinute } of minutes) {
    if (wallMinute % interval !== 0 || start <= now) continue;
    const occupiedFrom = start.toMillis() - (prep + travel) * 60000;
    const occupiedTo = start.toMillis() + (duration + cleanup + travel) * 60000;
    if (!runs.some((run) => occupiedFrom >= run.start && occupiedTo <= run.end)) continue;
    if (busyTimes.some((busy) => occupiedFrom < busy.end && busy.start < occupiedTo)) continue;
    const time = start.toFormat('HH:mm');
    if (allowed.length && !allowed.includes(time)) continue;
    if (experience.time_slot_start && time < experience.time_slot_start) continue;
    if (experience.time_slot_end && time > experience.time_slot_end) continue;
    const end = start.plus({ minutes: duration });
    const occupied = {
      start: DateTime.fromMillis(occupiedFrom, { zone: 'UTC' }).toISO()!,
      end: DateTime.fromMillis(occupiedTo, { zone: 'UTC' }).toISO()!,
    };
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
