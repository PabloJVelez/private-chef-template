import type { EditIntent } from "./edit-intent";
import type { ScheduleAnswer } from "./contracts";
import { formatProposedEdit } from "./edit-intent-presentation";

/** A shape-valid classifier result can still contradict the ON/TO contract.
 * Never silently repair it, carry it as an unfinished task, or resolve an event.
 * The existing exact-event manual editor is the deterministic correction path.
 */
export function clarifyEditMeaning(
  intent: EditIntent,
): ScheduleAnswer | undefined {
  if (intent.target === "date" || intent.targetDate == null) return;
  const date = formatProposedEdit({
    date: intent.targetDate,
    time: null,
  }).replace("Proposed date: ", "");
  return {
    presentation: "clarification",
    entries: [],
    message: `Is ${date} the date to move the event TO, or the date of the event you're trying to find (ON)? Use Change date/time on the intended event, then enter the new date/time directly.`,
  };
}
