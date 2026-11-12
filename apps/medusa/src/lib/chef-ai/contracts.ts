import type { CalendarEntry, TimeInterval } from "../chef-workspace/contracts";

export type ScheduleAnswer = {
  message: string;
  timeZone?: string;
  range?: TimeInterval;
  complete?: boolean;
  entries: CalendarEntry[];
};
export type ChatInput = { message: string; previousQuestions?: string[] };
