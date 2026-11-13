import { DateTime, IANAZone } from "luxon";
import { z } from "@medusajs/framework/zod";

export const periods = [
  "today",
  "tomorrow",
  "this_week",
  "next_week",
  "this_weekend",
  "next_weekend",
  "dates",
] as const;
export const scheduleArgs = z
  .object({
    period: z.enum(periods),
    startDate: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/)
      .nullable(),
    endDate: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/)
      .nullable(),
    timeZone: z.string().max(100),
  })
  .strict();

export function scheduleTool(timeZone: string) {
  return {
    type: "function" as const,
    function: {
      name: "get_schedule",
      description:
        "Read recorded private-event schedule facts only. Weeks start Monday; weekends are Saturday and Sunday. Never decides availability. For dates use local YYYY-MM-DD, start inclusive, end exclusive; a single date ends the next day. Maximum 31 local days, within one year of today. All statuses; no filters.",
      strict: true,
      parameters: {
        type: "object",
        additionalProperties: false,
        properties: {
          period: { type: "string", enum: [...periods] },
          startDate: {
            type: ["string", "null"],
            description:
              "Null for relative periods; otherwise inclusive local date.",
          },
          endDate: {
            type: ["string", "null"],
            description:
              "Null for relative periods; otherwise exclusive local date.",
          },
          timeZone: { type: "string", enum: [timeZone] },
        },
        required: ["period", "startDate", "endDate", "timeZone"],
      },
    },
  };
}

export function validTimeZone(zone: unknown): zone is string {
  return (
    typeof zone === "string" && zone.length <= 100 && IANAZone.isValidZone(zone)
  );
}

export function resolveScheduleRange(
  input: unknown,
  timeZone: string,
  now = new Date(),
) {
  const args = scheduleArgs.parse(input);
  if (!validTimeZone(timeZone) || args.timeZone !== timeZone)
    throw new Error("Invalid timezone");
  const today = DateTime.fromJSDate(now, { zone: timeZone }).startOf("day");
  let start = today;
  let end = today.plus({ days: 1 });
  if (args.period === "dates") {
    if (!args.startDate || !args.endDate) throw new Error("Dates required");
    start = DateTime.fromISO(args.startDate, { zone: timeZone }).startOf("day");
    end = DateTime.fromISO(args.endDate, { zone: timeZone }).startOf("day");
    // Reject invalid dates and zones that skip an entire calendar date.
    if (
      start.toISODate() !== args.startDate ||
      end.toISODate() !== args.endDate
    )
      throw new Error("Invalid dates");
  } else {
    if (args.startDate !== null || args.endDate !== null)
      throw new Error("Conflicting dates");
    if (args.period === "tomorrow") start = today.plus({ days: 1 });
    if (args.period.includes("week")) {
      start = today.startOf("week");
      if (args.period.startsWith("next_")) start = start.plus({ weeks: 1 });
      if (args.period.endsWith("weekend")) start = start.plus({ days: 5 });
    }
    end = start.plus({
      days: args.period.endsWith("weekend")
        ? 2
        : args.period.endsWith("week")
          ? 7
          : 1,
    });
  }
  const days = end.diff(start, "days").days;
  if (
    !start.isValid ||
    !end.isValid ||
    days <= 0 ||
    days > 31 ||
    start < today.minus({ days: 366 }) ||
    end > today.plus({ days: 367 })
  )
    throw new Error("Range out of bounds");
  return { start: start.toUTC().toISO()!, end: end.toUTC().toISO()! };
}
