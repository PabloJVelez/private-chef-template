import type { EditContext, EditIntent, EditProposal } from "./edit-intent";
import type { CalendarEntry, TimeInterval } from "../chef-workspace/contracts";

import type { periods } from "./schedule";

export type ScheduleAnswer = {
  editContext?: EditContext;
  editProposal?: EditProposal;
  editClarification?: { intent: EditIntent; context: EditContext };
  /** Validated tool selection for diagnostics; never raw model output. */
  period?: (typeof periods)[number];
  message: string;
  timeZone?: string;
  range?: TimeInterval;
  complete?: boolean;
  entries: CalendarEntry[];
};
export type ChatInput = {
  message: string;
  context?: EditContext;
  /** Accepted within existing caps for older Admin clients; never sent to the model. */
  previousQuestions?: string[];
};
