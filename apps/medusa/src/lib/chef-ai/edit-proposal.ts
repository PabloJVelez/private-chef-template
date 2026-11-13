import { DateTime } from "luxon";
import type { MedusaContainer } from "@medusajs/framework/types";
import type ChefEventModuleService from "../../modules/chef-event/service";
import { CHEF_EVENT_MODULE } from "../../modules/chef-event";
import { localSchedule } from "../private-event-schedule/command";
import { readCalendar } from "../chef-workspace/read";
import type { CalendarResult, TimeInterval } from "../chef-workspace/contracts";
import type { ScheduleAnswer } from "./contracts";
import {
  type EditContext,
  type EditIntent,
  MAX_EDIT_CANDIDATES,
  editIntentSchema,
  editContextSchema,
} from "./edit-intent";

const service = (scope: MedusaContainer) =>
  scope.resolve<ChefEventModuleService>(CHEF_EVENT_MODULE);
const message = (message: string): ScheduleAnswer => ({ message, entries: [] });
/** Snapshot revisions come from the server, and must describe the SAME rows as the displayed read. */
export async function attachEditContext(
  scope: MedusaContainer,
  answer: ScheduleAnswer,
): Promise<ScheduleAnswer> {
  if (
    !answer.complete ||
    !answer.entries.length ||
    answer.entries.length > MAX_EDIT_CANDIDATES
  )
    return answer;
  const candidates = await Promise.all(
    answer.entries.map(async (entry) => {
      if (entry.source.type !== "private-event") return null;
      try {
        const current = await service(scope).readScheduleEditEvent(
          entry.source.id,
        );
        if (
          new Date(current.requestedDate).toISOString() !==
            entry.requestedTime?.start ||
          current.timeZone !== entry.timeZone ||
          current.status !== entry.status
        )
          return null;
        return { id: current.id, revision: current.revision };
      } catch {
        return null;
      } // The schedule read remains useful, but cannot anchor an edit.
    }),
  );
  return candidates.every((c) => c !== null)
    ? { ...answer, editContext: { candidates, observedAt: Date.now() } }
    : answer;
}

/** Resolves intent against fresh domain data. This function cannot preview, confirm, dispatch, or mutate. */
export async function resolveEditProposal(
  scope: MedusaContainer,
  rawIntent: EditIntent,
  rawContext: EditContext | undefined,
  zone: string,
  now = new Date(Date.now()),
  explicitSelection = false,
  lookup: (range: TimeInterval) => Promise<CalendarResult> = (range) =>
    readCalendar(scope, range),
): Promise<ScheduleAnswer> {
  let intent = editIntentSchema.parse(rawIntent);
  let context = rawContext ? editContextSchema.parse(rawContext) : undefined;
  const unfinished = (text: string): ScheduleAnswer => ({
    ...message(text),
    editTask: {
      version: 1,
      intent,
      ...(context ? { context } : {}),
      expiresAt: now.getTime() + 300_000,
    },
  });
  if (intent.clarification === "time")
    return unfinished("What arrival time? Include AM/PM.");
  if (intent.clarification === "date")
    return unfinished("What new date would you like? Include the month.");
  if (intent.target === "date" && !explicitSelection) {
    if (!intent.targetDate)
      return unfinished("Which event date? Include the month and year.");
    const today = DateTime.fromJSDate(now, { zone });
    let anchor = today;
    if (intent.targetDate.kind === "day_of_month" && context) {
      if (
        now.getTime() - context.observedAt > 300_000 ||
        context.observedAt > now.getTime() + 5000
      )
        return unfinished(
          "Which month and year? The earlier schedule context expired.",
        );
      const selectedId = context.selectedId;
      const candidates = selectedId
        ? context.candidates.filter((c) => c.id === selectedId)
        : context.candidates;
      const months = new Set<string>();
      try {
        for (const candidate of candidates) {
          const snapshot = await service(scope).readScheduleEditEvent(
            candidate.id,
          );
          if (snapshot.revision !== candidate.revision)
            return message(
              "This event changed. Refresh and review its current date/time.",
            );
          const saved = localSchedule(snapshot);
          if (saved.timezone !== zone)
            return unfinished(
              "Which month and year? The event timezone differs from business availability.",
            );
          months.add(saved.date.slice(0, 7));
        }
      } catch {
        return message("Refresh the schedule before choosing an event date.");
      }
      if (months.size !== 1)
        return unfinished("Which month and year is the event in?");
      anchor = DateTime.fromISO([...months][0] + "-01", { zone });
    }
    const target = resolveDate(intent.targetDate, anchor, today);
    if (
      !target.isValid ||
      Math.abs(target.diff(today.startOf("day"), "days").days) > 366
    )
      return unfinished(
        "Which event date? Give a valid month, day and year within one year.",
      );
    const day = target.startOf("day");
    const range = {
      start: day.toUTC().toISO()!,
      end: day.plus({ days: 1 }).toUTC().toISO()!,
    };
    const result = await lookup(range);
    if (
      !result.complete ||
      result.range.start !== range.start ||
      result.range.end !== range.end ||
      result.entries.length > MAX_EDIT_CANDIDATES ||
      result.entries.some((e) => e.protectedTime.length > 20)
    )
      return message(
        "Too many or incomplete records for that day. Open the calendar and select the event.",
      );
    // 'Event on a date' means its recorded requested arrival day, never an estimated display interval.
    const entries = result.entries.filter(
      (e) =>
        e.requestedTime &&
        DateTime.fromISO(e.requestedTime.start, { zone }).toISODate() ===
          day.toISODate(),
    );
    intent = {
      ...intent,
      targetDate: { kind: "iso", value: day.toISODate()! },
    };
    if (!entries.length)
      return unfinished(
        `No event on ${day.toFormat("MMM d, yyyy")}. Which date did you mean?`,
      );
    if (new Set(entries.map((e) => e.source.id)).size !== entries.length)
      return message("Refresh the calendar to choose the event.");
    const checked = await attachEditContext(scope, {
      message: "",
      entries,
      complete: true,
    });
    if (!checked.editContext)
      return message(
        "The schedule changed. Refresh and review the event first.",
      );
    context = { ...checked.editContext, observedAt: now.getTime() };
    if (entries.length > 1)
      return {
        ...unfinished(`Which event on ${day.toFormat("MMM d, yyyy")}?`),
        editClarification: { intent, context, cards: entries },
      };
    // Exactly one across ALL statuses. Eligibility is checked on the fresh snapshot below.
    context = { ...context, selectedId: entries[0].source.id };
  }
  if (!intent.date && intent.time === null)
    return unfinished("What date or arrival time would you like?");
  if (
    !context ||
    now.getTime() - context.observedAt > 300_000 ||
    context.observedAt > now.getTime() + 5000
  ) {
    context = undefined;
    const time = intent.time
      ? DateTime.fromFormat(intent.time, "HH:mm", { zone })
          .toFormat("h:mm a")
          .replace(":00", "")
      : undefined;
    return unfinished(
      time
        ? `Which event should I move to ${time}?`
        : "Which event? Give its date.",
    );
  }
  // Count ALL entries before eligibility; one pending plus one confirmed is ambiguous.
  const id =
    intent.target === "date" ||
    (intent.target === "context" && intent.clarification !== "target") ||
    explicitSelection
      ? context.selectedId ||
        (context.candidates.length === 1 ? context.candidates[0].id : undefined)
      : undefined;
  if (!id)
    return {
      ...unfinished("Which event? Choose below."),
      editClarification: { intent, context },
    };
  const candidate = context.candidates.find((c) => c.id === id)!;
  let current;
  try {
    current = await service(scope).readScheduleEditEvent(id);
  } catch {
    return message("This event is no longer available. Refresh the schedule.");
  }
  if (current.revision !== candidate.revision)
    return message(
      "This event changed. Refresh and review its current date/time.",
    );
  if (current.status !== "pending")
    return message("Only pending requests can be changed here.");
  let saved;
  try {
    saved = localSchedule(current);
  } catch {
    return message(
      "The saved event date/time or timezone is inconsistent. Open the live event to reconcile it before proposing a change.",
    );
  }
  if (saved.timezone !== zone)
    return message(
      "The event timezone differs from saved business availability. Reconcile the timezone before proposing a change.",
    );
  const original = DateTime.fromISO(saved.date, { zone });
  const expression = intent.date;
  let date: string | undefined;
  if (expression) {
    const resolved = resolveDate(
      expression,
      original,
      DateTime.fromJSDate(now, { zone }),
    );
    if (!resolved.isValid)
      return message("That date does not exist. Give a valid date.");
    date = resolved.toISODate()!;
  }
  return {
    ...message("Review this change before confirming."),
    editProposal: {
      eventId: id,
      expectedRevision: current.revision,
      ...(date ? { date } : {}),
      ...(intent.time !== null ? { time: intent.time } : {}),
    },
  };
}

/** Ordinals use the supplied base month; relative days always use business-local today. */
function resolveDate(
  expression: NonNullable<EditIntent["date"]>,
  base: DateTime,
  today: DateTime,
): DateTime {
  const zone = today.zoneName!;
  if (expression.kind === "iso")
    return DateTime.fromISO(expression.value, { zone });
  if (expression.kind === "relative_day")
    return today.startOf("day").plus({ days: expression.offset });
  return DateTime.fromObject(
    {
      year:
        expression.kind === "month_day"
          ? (expression.year ?? base.year)
          : base.year,
      month: expression.kind === "month_day" ? expression.month : base.month,
      day: expression.day,
    },
    { zone },
  );
}
