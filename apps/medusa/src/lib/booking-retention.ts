/** Native completed execution history, in seconds. This is not a reservation TTL.
 * Active protected time is released only by Scheduling's verified cleanup path.
 */
export const BOOKING_EXECUTION_RETENTION_SECONDS = 60 * 60 * 24 * 90;

export const BOOKING_HISTORY_UNAVAILABLE =
  'Acceptance execution history is unavailable. Do not replay this attempt. Inspect the event, product, protected time and external effects using the recovery runbook.';
