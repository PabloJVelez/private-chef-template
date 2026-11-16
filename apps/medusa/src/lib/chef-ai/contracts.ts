import type { PageHint, VerifiedEventTarget } from "./page-context";
import type {
  EditContext,
  EditIntent,
  EditProposal,
  EditTask,
} from "./edit-intent";
import type { CalendarEntry, TimeInterval } from "../chef-workspace/contracts";

import type { periods } from "./schedule";

export type ScheduleAnswer = {
  summary?: import("./assistant-read").EventSummary;
  summaryChoices?: import("./assistant-read").EventSummary[];
  presentation?:
    | "answer"
    | "list"
    | "clarification"
    | "proposal"
    | "unavailable";
  editContext?: EditContext;
  editTask?: EditTask;
  editProposal?: EditProposal;
  editClarification?: {
    intent: EditIntent;
    context: EditContext;
    cards?: CalendarEntry[];
    targets?: VerifiedEventTarget[];
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
  page?: PageHint;
  message: string;
  context?: EditContext;
  task?: EditTask;
  /** Accepted within existing caps for older Admin clients; never sent to the model. */
  previousQuestions?: string[];
};
