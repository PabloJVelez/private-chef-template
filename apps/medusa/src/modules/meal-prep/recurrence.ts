import { createHash } from "node:crypto";
import { DateTime, IANAZone } from "luxon";
import { z } from "zod";
import { localDateSchema } from "./capture-contracts";

const id = z.string().min(1).max(200);
const clock = z.string().regex(/^(?:[01]\d|2[0-3]):[0-5]\d$/);
const timezone = z.string().refine((v) => IANAZone.isValidZone(v));
const slot = z
  .object({ id, weekday: z.number().int().min(1).max(7), localTime: clock })
  .strict();
const fixed = { timezone, anchorDate: localDateSchema, slot };
export const recurrenceSchema = z
  .discriminatedUnion("kind", [
    z.object({ kind: z.literal("weekly"), ...fixed }).strict(),
    z.object({ kind: z.literal("fortnightly"), ...fixed }).strict(),
    z
      .object({
        kind: z.literal("multiple_weekly"),
        timezone,
        anchorDate: localDateSchema,
        slots: z.array(slot).min(2),
      })
      .strict(),
    z
      .object({
        kind: z.literal("custom_dates"),
        timezone,
        dates: z
          .array(
            z
              .object({ id, localDate: localDateSchema, localTime: clock })
              .strict(),
          )
          .min(1),
      })
      .strict(),
  ])
  .superRefine((v, ctx) => {
    const slots =
      v.kind === "multiple_weekly"
        ? v.slots
        : v.kind === "custom_dates"
          ? v.dates
          : [v.slot];
    if (new Set(slots.map((s) => s.id)).size !== slots.length)
      ctx.addIssue({
        code: "custom",
        message: "Slot identities must be unique",
      });
    if (
      (v.kind === "weekly" || v.kind === "fortnightly") &&
      DateTime.fromISO(v.anchorDate, { zone: "UTC" }).weekday !== v.slot.weekday
    )
      ctx.addIssue({
        code: "custom",
        message: "Anchor must be the agreed first visit weekday",
      });
  });
export const boundsSchema = z
  .object({ from: localDateSchema, through: localDateSchema })
  .strict()
  .refine((v) => v.from <= v.through);
export type Recurrence = z.infer<typeof recurrenceSchema>;
export type Candidate = {
  generationKey: string;
  occurrenceId: string;
  slotId: string;
  localDate: string;
  localTime: string;
  timezone: string;
  resolution:
    | { status: "resolved"; instant: string }
    | { status: "gap"; instants: [] }
    | { status: "fold"; instants: string[] };
};

/** No default horizon or DST choice. Bounds are inclusive local calendar dates.
 * Fortnightly parity is elapsed calendar days from the agreed first visit, never ISO week parity.
 * Candidates are NOT scheduled bookings or reservations. No previous menu is copied. */
export function generateCandidates(input: {
  arrangementId: string;
  revisionId: string;
  recurrence: Recurrence;
  bounds: z.infer<typeof boundsSchema>;
}): Candidate[] {
  id.parse(input.arrangementId);
  id.parse(input.revisionId);
  const recurrence = recurrenceSchema.parse(input.recurrence),
    bounds = boundsSchema.parse(input.bounds);
  const result: Candidate[] = [];
  const add = (slotId: string, localDate: string, localTime: string) => {
    const logical = JSON.stringify([
      input.arrangementId,
      input.revisionId,
      slotId,
      localDate,
    ]);
    const generationKey = `mpg_${createHash("sha256").update(logical).digest("hex")}`;
    const local = DateTime.fromISO(`${localDate}T${localTime}`, {
      zone: recurrence.timezone,
    });
    const instants =
      local.toFormat("yyyy-MM-dd'T'HH:mm") === `${localDate}T${localTime}`
        ? [
            ...new Set(
              local.getPossibleOffsets().map((d) => d.toUTC().toISO()!),
            ),
          ].sort()
        : [];
    result.push({
      generationKey,
      occurrenceId: `mpocc_${generationKey.slice(4)}`,
      slotId,
      localDate,
      localTime,
      timezone: recurrence.timezone,
      resolution:
        instants.length === 1
          ? { status: "resolved", instant: instants[0] }
          : instants.length === 0
            ? { status: "gap", instants: [] }
            : { status: "fold", instants },
    });
  };
  if (recurrence.kind === "custom_dates") {
    for (const date of recurrence.dates)
      if (date.localDate >= bounds.from && date.localDate <= bounds.through)
        add(date.id, date.localDate, date.localTime);
  } else {
    const anchor = DateTime.fromISO(recurrence.anchorDate, { zone: "UTC" });
    const slots =
      recurrence.kind === "multiple_weekly"
        ? recurrence.slots
        : [recurrence.slot];
    for (
      let day = DateTime.fromISO(bounds.from, { zone: "UTC" });
      day.toMillis() <=
      DateTime.fromISO(bounds.through, { zone: "UTC" }).toMillis();
      day = day.plus({ days: 1 })
    ) {
      const elapsed = day.diff(anchor, "days").days;
      if (
        elapsed < 0 ||
        (recurrence.kind === "fortnightly" && elapsed % 14 !== 0)
      )
        continue;
      for (const s of slots)
        if (day.weekday === s.weekday) add(s.id, day.toISODate()!, s.localTime);
    }
  }
  return result.sort((a, b) =>
    `${a.localDate} ${a.localTime} ${a.slotId}`.localeCompare(
      `${b.localDate} ${b.localTime} ${b.slotId}`,
    ),
  );
}
