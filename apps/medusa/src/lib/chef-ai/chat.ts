import { assistantReadSchema, type AssistantRead } from "./assistant-read";
import { validTimeZone } from "./schedule";
import { pageHintSchema } from "./page-context";
import { composeSchedule } from "./presentation";
import {
  editContextSchema,
  editTaskSchema,
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
    page: pageHintSchema.optional(),
    message: z.string().trim().min(1).max(1000),
    context: editContextSchema.optional(),
    task: editTaskSchema.optional(),
    previousQuestions: z
      .array(z.string().trim().min(1).max(1000))
      .max(4)
      .optional(),
  })
  .strict();
const clarification =
  "I can help with your schedule, this event, or a pending date/time change. What would you like to check?";
export class MissingBusinessTimezone extends Error {}

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
  assistant?: (kind: AssistantRead) => Promise<ScheduleAnswer>,
): Promise<ScheduleAnswer> {
  const parsed = chatInput.parse(input);
  const { calls } = await select({ message: parsed.message }, timeZone, now);
  if (!calls.length) return { message: clarification, entries: [] };
  // Reject the entire batch before any read, including duplicate/replayed calls.
  if (
    calls.length !== 1 ||
    ![
      "get_schedule",
      "propose_pending_event_date_time_edit",
      "assistant_read",
    ].includes(calls[0].name) ||
    calls[0].arguments.length > 1000
  )
    throw new Error("Invalid model tool call");
  if (calls[0].name === "assistant_read") {
    const { kind } = assistantReadSchema.parse(JSON.parse(calls[0].arguments));
    return assistant
      ? assistant(kind)
      : { message: clarification, entries: [] };
  }
  if (!validTimeZone(timeZone)) throw new MissingBusinessTimezone();
  if (calls[0].name === "propose_pending_event_date_time_edit") {
    let intent = editIntentSchema.parse(JSON.parse(calls[0].arguments));
    let context = parsed.context;
    const continuing = intent.continuation === true;
    if (continuing) {
      const task = parsed.task;
      if (
        !task ||
        task.expiresAt <= now.getTime() ||
        task.expiresAt > now.getTime() + 300_000
      )
        return {
          entries: [],
          message:
            "No unfinished change to continue. Tell me the event date and new date or time.",
        };
      intent = editIntentSchema.parse({
        ...task.intent,
        ...intent,
        target: intent.targetDate ? "date" : task.intent.target,
        targetDate: intent.targetDate ?? task.intent.targetDate,
        date:
          intent.clarification === "date"
            ? null
            : (intent.date ?? task.intent.date),
        time:
          intent.clarification === "time"
            ? null
            : (intent.time ?? task.intent.time),
        continuation: false,
      });
      context = parsed.context ?? task.context;
    }
    if (!propose) return { message: clarification, entries: [] };
    const answer = await propose(intent, context);
    if (
      continuing &&
      answer.editTask &&
      parsed.task &&
      parsed.task.expiresAt > now.getTime()
    )
      answer.editTask.expiresAt = Math.min(
        answer.editTask.expiresAt,
        parsed.task.expiresAt,
      );
    return answer;
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
  return composeSchedule({
    message: entries.length
      ? `${entries.length} recorded event${entries.length === 1 ? "" : "s"}.`
      : "No recorded events in this window; availability is not checked.",
    timeZone,
    period,
    range,
    complete: true,
    entries,
  });
}

export const proposalSelectionInput = z
  .object({
    page: pageHintSchema.optional(),
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
