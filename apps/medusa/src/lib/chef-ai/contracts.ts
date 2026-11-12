import type { CalendarEntry, TimeInterval } from "../chef-workspace/contracts";

import type { periods } from "./schedule";

export type ScheduleAnswer = {
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
  /** Accepted within existing caps for older Admin clients; never sent to the model. */
  previousQuestions?: string[];
};
