import type { RequestSummary } from "../chef-workspace/contracts";
import type { ScheduleAnswer } from "./contracts";
const labels = {
  pending: "pending request",
  confirmed: "confirmed appointment",
  cancelled: "cancelled event",
  completed: "completed appointment",
};
/** Deterministic facts only. No model verbalization, estimated arrival or availability inference. */
export function eventSentence(event: RequestSummary) {
  const interval =
    event.status === "confirmed" || event.status === "completed"
      ? event.appointmentTime
      : event.requestedTime;
  const at = interval
    ? new Intl.DateTimeFormat("en-US", {
        timeZone: event.timeZone,
        month: "long",
        day: "numeric",
        year: "numeric",
        hour: "numeric",
        minute: "2-digit",
      }).format(new Date(interval.start))
    : undefined;
  return {
    before: `You have ${labels[event.status] === "pending request" ? "one pending request" : `a ${labels[event.status]}`}, `,
    after: at ? `, on ${at}.` : ", with no recorded arrival time.",
  };
}
export function composeSchedule(answer: ScheduleAnswer): ScheduleAnswer {
  if (!answer.complete) return { ...answer, presentation: "unavailable" };
  if (answer.entries.length === 1) {
    const entry = answer.entries[0],
      sentence = eventSentence(entry);
    return {
      ...answer,
      presentation: "answer",
      message: sentence.before + entry.title + sentence.after,
    };
  }
  return {
    ...answer,
    presentation: answer.entries.length ? "list" : "answer",
    message: answer.entries.length
      ? `You have ${answer.entries.length} recorded events in this window.`
      : answer.message,
  };
}
