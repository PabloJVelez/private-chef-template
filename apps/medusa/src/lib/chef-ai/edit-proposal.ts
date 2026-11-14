import {
  pageHintSchema,
  type PageHint,
  type VerifiedEventTarget,
} from "./page-context";
import type { ScheduleSnapshot } from "../../modules/chef-event/schedule-edit";
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
const message = (message: string): ScheduleAnswer => ({
  presentation: "unavailable",
  message,
  entries: [],
});
const target = (event: ScheduleSnapshot): VerifiedEventTarget => ({
  id: event.id,
  title: event.title || "Untitled",
  status: event.status,
  revision: event.revision,
  ...localSchedule(event),
});
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
  rawPage?: PageHint,
): Promise<ScheduleAnswer> {
  const page = rawPage ? pageHintSchema.parse(rawPage) : undefined;
  let intent = editIntentSchema.parse(rawIntent);
  let context = rawContext ? editContextSchema.parse(rawContext) : undefined;
  const unfinished = (text: string): ScheduleAnswer => ({
    ...message(text),
    presentation: "clarification",
    editTask: {
      version: 1,
      intent,
      ...(context ? { context } : {}),
      expiresAt: now.getTime() + 300_000,
    },
  });
  // A page resource is an untrusted hint. Validate it before considering chat
  // targets; missing/deleted/inaccessible page data must never fall back to A.
  if (
    !explicitSelection &&
    intent.target === "context" &&
    page?.surface === "chef-events"
  ) {
    let opened: ScheduleSnapshot;
    try {
      opened = await service(scope).readScheduleEditEvent(page.resource.id);
      if (
        opened.id !== page.resource.id ||
        localSchedule(opened).timezone !== zone
      )
        throw new Error();
    } catch {
      return message(
        "The event open on this page could not be verified. Refresh the page before choosing a change.",
      );
    }
    const recent =
      context &&
      now.getTime() - context.observedAt <= 300_000 &&
      context.observedAt <= now.getTime() + 5000;
    // A past selectedId is not a new explicit choice. Count every fresh candidate.
    const competing = recent
      ? context!.candidates.filter((c) => c.id !== opened.id)
      : [];
    if (competing.length) {
      if (competing.length >= MAX_EDIT_CANDIDATES)
        return message("Select the event from a narrower schedule first.");
      const verified: VerifiedEventTarget[] = [target(opened)];
      try {
        for (const candidate of competing) {
          const current = await service(scope).readScheduleEditEvent(
            candidate.id,
          );
          if (
            current.id !== candidate.id ||
            current.revision !== candidate.revision
          )
            throw new Error();
          verified.push(target(current));
        }
      } catch {
        return message(
          "The discussed event changed or is unavailable. Refresh the schedule before choosing.",
        );
      }
      context = {
        candidates: verified.map((t) => ({ id: t.id, revision: t.revision })),
        observedAt: now.getTime(),
      };
      return {
        ...unfinished(
          "The event open on this page, or the event we just discussed?",
        ),
        editClarification: { intent, context, targets: verified },
      };
    }
    if (
      recent &&
      context!.candidates.some(
        (c) => c.id === opened.id && c.revision !== opened.revision,
      )
    )
      return message(
        "This event changed. Refresh and review its current date/time.",
      );
    context = {
      candidates: [{ id: opened.id, revision: opened.revision }],
      observedAt: now.getTime(),
    };
  }
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
  if (!id) {
    const targets: VerifiedEventTarget[] = [];
    try {
      for (const candidate of context.candidates) {
        const event = await service(scope).readScheduleEditEvent(candidate.id);
        if (event.id !== candidate.id || event.revision !== candidate.revision)
          throw new Error();
        targets.push(target(event));
      }
    } catch {
      return message("The schedule changed. Refresh before choosing an event.");
    }
    return {
      ...unfinished("Which event? Choose below."),
      editClarification: { intent, context, targets },
    };
  }
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
    presentation: "proposal",
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
