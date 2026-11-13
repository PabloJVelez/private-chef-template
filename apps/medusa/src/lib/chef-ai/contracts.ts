import type {
  EditContext,
  EditIntent,
  EditProposal,
  EditTask,
} from "./edit-intent";
import type { CalendarEntry, TimeInterval } from "../chef-workspace/contracts";

import type { periods } from "./schedule";

export type ScheduleAnswer = {
  editContext?: EditContext;
  editTask?: EditTask;
  editProposal?: EditProposal;
  editClarification?: {
    intent: EditIntent;
    context: EditContext;
    cards?: CalendarEntry[];
  };
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
  task?: EditTask;
  /** Accepted within existing caps for older Admin clients; never sent to the model. */
  previousQuestions?: string[];
};
