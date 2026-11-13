import {
  editContextSchema,
  editIntentSchema,
  type EditContext,
  type EditIntent,
} from "./edit-intent";
import { z } from "@medusajs/framework/zod";
import type { CalendarResult } from "../chef-workspace/contracts";
import type { ChatInput, ScheduleAnswer } from "./contracts";
import type { SelectSchedule } from "./provider";
import { resolveScheduleRange, scheduleArgs } from "./schedule";

export const chatInput = z
  .object({
    message: z.string().trim().min(1).max(1000),
    context: editContextSchema.optional(),
    previousQuestions: z
      .array(z.string().trim().min(1).max(1000))
      .max(4)
      .optional(),
  })
  .strict();
const clarification =
  "Ask about recorded events for a day, week, weekend, or a date range of up to 31 days. I can read schedule facts and propose pending-event date/time changes. Only the Confirm change button saves a preview; chat text cannot confirm or decide availability.";

export async function answerSchedule(
  input: ChatInput,
  timeZone: string,
  select: SelectSchedule,
  read: (range: { start: string; end: string }) => Promise<CalendarResult>,
  now = new Date(),
  propose?: (
    intent: EditIntent,
    context?: EditContext,
  ) => Promise<ScheduleAnswer>,
): Promise<ScheduleAnswer> {
  const parsed = chatInput.parse(input);
  const { calls } = await select({ message: parsed.message }, timeZone, now);
  if (!calls.length) return { message: clarification, entries: [] };
  // Reject the entire batch before any read, including duplicate/replayed calls.
  if (
    calls.length !== 1 ||
    !["get_schedule", "propose_pending_event_date_time_edit"].includes(
      calls[0].name,
    ) ||
    calls[0].arguments.length > 1000
  )
    throw new Error("Invalid model tool call");
  if (calls[0].name === "propose_pending_event_date_time_edit") {
    const intent = editIntentSchema.parse(JSON.parse(calls[0].arguments));
    return propose
      ? propose(intent, parsed.context)
      : { message: clarification, entries: [] };
  }
  let range: { start: string; end: string };
  let period: ScheduleAnswer["period"];
  try {
    const args = scheduleArgs.parse(JSON.parse(calls[0].arguments));
    period = args.period;
    range = resolveScheduleRange(args, timeZone, now);
  } catch {
    return { message: clarification, entries: [] };
  }
  const result = await read(range);
  // No pagination guess and no silent truncation: ask for a narrower window.
  if (
    !result.complete ||
    result.entries.length > 100 ||
    result.entries.some((entry) => entry.protectedTime.length > 20)
  )
    return {
      message:
        "This schedule read is incomplete or too large to display. Ask for a narrower date range. No conclusion can be drawn from missing events.",
      timeZone,
      period,
      range,
      complete: false,
      entries: [],
    };
  if (result.range.start !== range.start || result.range.end !== range.end)
    throw new Error("Unexpected calendar range");
  const entries = result.entries.map((entry) => {
    if (
      entry.detailPath !== `/chef-events/${encodeURIComponent(entry.source.id)}`
    )
      throw new Error("Invalid detail link");
    return {
      id: entry.id,
      source: entry.source,
      detailPath: entry.detailPath,
      title: entry.title.slice(0, 160),
      category: entry.category.slice(0, 100),
      status: entry.status,
      requestedTime: entry.requestedTime,
      appointmentTime: entry.appointmentTime,
      displayTime: entry.displayTime,
      protectedTime: entry.protectedTime,
      timeZone: entry.timeZone,
    };
  });
  return {
    message: entries.length
      ? `${entries.length} recorded event${entries.length === 1 ? "" : "s"} overlap this window. All statuses are included. These records do not determine availability.`
      : "No matching recorded events in this window. This does not mean you are free or available.",
    timeZone,
    period,
    range,
    complete: true,
    entries,
  };
}

export const proposalSelectionInput = z
  .object({
    selection: z
      .object({
        intent: editIntentSchema,
        context: editContextSchema.refine(
          (context) => !!context.selectedId,
          "Choose an exact event.",
        ),
      })
      .strict(),
  })
  .strict();
