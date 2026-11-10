/** Read-only presentation contracts. Private Events owns status, details and all commands. */
export type WorkspaceSource = { type: 'private-event'; id: string };
export type TimeInterval = { start: string; end: string };
export type RequestSummary = {
  id: string;
  source: WorkspaceSource;
  detailPath: string;
  title: string;
  category: string;
  status: 'pending' | 'confirmed' | 'cancelled' | 'completed';
  requestedTime: TimeInterval | null;
  appointmentTime: TimeInterval | null;
  timeZone: string;
};
export type CalendarEntry = RequestSummary & {
  displayTime: TimeInterval;
  /** Scheduling owns these intervals; event status alone never implies protection. */
  protectedTime: Array<TimeInterval & { state: 'held' | 'confirmed' }>;
};
export type RequestPage = { items: RequestSummary[]; count: number; limit: number; offset: number };
export type CalendarResult = {
  entries: CalendarEntry[];
  range: TimeInterval;
  complete: boolean;
};
