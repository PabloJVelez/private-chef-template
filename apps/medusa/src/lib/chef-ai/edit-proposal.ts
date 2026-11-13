import { DateTime } from "luxon";
import type { MedusaContainer } from "@medusajs/framework/types";
import type ChefEventModuleService from "../../modules/chef-event/service";
import { CHEF_EVENT_MODULE } from "../../modules/chef-event";
import { localSchedule } from "../private-event-schedule/command";
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
  now = new Date(),
  explicitSelection = false,
): Promise<ScheduleAnswer> {
  const intent = editIntentSchema.parse(rawIntent);
  const context = rawContext ? editContextSchema.parse(rawContext) : undefined;
  if (intent.clarification === "time")
    return message(
      "Please specify the arrival time with AM/PM or 24-hour HH:mm, or use Change date/time. No change was made.",
    );
  if (intent.clarification === "date")
    return message(
      "Please give a specific date, or use Change date/time. No change was made.",
    );
  if (!intent.date && intent.time === null)
    return message(
      "What date or arrival time would you like? No change was made.",
    );
  if (
    !context ||
    now.getTime() - context.observedAt > 5 * 60_000 ||
    context.observedAt > now.getTime() + 5000
  )
    return message(
      "Which event? Read its schedule again or select Change date/time on a current event card. No change was made.",
    );
  // Count ALL entries before eligibility; one pending plus one confirmed is ambiguous.
  const id =
    (intent.target === "context" && intent.clarification !== "target") ||
    explicitSelection
      ? context.selectedId ||
        (context.candidates.length === 1 ? context.candidates[0].id : undefined)
      : undefined;
  if (!id)
    return {
      ...message(
        "Which event? Choose the exact event for this proposed date/time change.",
      ),
      editClarification: { intent, context },
    };
  const candidate = context.candidates.find((c) => c.id === id)!;
  let current;
  try {
    current = await service(scope).readScheduleEditEvent(id);
  } catch {
    return message(
      "This event is no longer available. Refresh the schedule before proposing a change.",
    );
  }
  if (current.revision !== candidate.revision)
    return message(
      "This event changed since the displayed schedule. Refresh and review its current date/time before proposing a change.",
    );
  if (current.status !== "pending")
    return message(
      "Only pending requests can be changed here. Refresh the schedule and choose a pending event.",
    );
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
    const resolved =
      expression.kind === "iso"
        ? DateTime.fromISO(expression.value, { zone })
        : expression.kind === "relative_day"
          ? DateTime.fromJSDate(now, { zone })
              .startOf("day")
              .plus({ days: expression.offset })
          : DateTime.fromObject(
              {
                year:
                  expression.kind === "month_day"
                    ? (expression.year ?? original.year)
                    : original.year,
                month:
                  expression.kind === "month_day"
                    ? expression.month
                    : original.month,
                day: expression.day,
              },
              { zone },
            );
    if (!resolved.isValid)
      return message(
        "That date does not exist in the requested month. Please give a valid date; no alternate date was chosen.",
      );
    date = resolved.toISODate()!;
  }
  return {
    ...message(
      "Review the proposed change below. Only Confirm change can save it; availability is checked by the preview.",
    ),
    editProposal: {
      eventId: id,
      expectedRevision: current.revision,
      ...(date ? { date } : {}),
      ...(intent.time !== null ? { time: intent.time } : {}),
    },
  };
}
