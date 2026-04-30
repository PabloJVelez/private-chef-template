/**
 * Chef Events calendar: URL `statuses` param and default list filter (pending + confirmed).
 * Shared by admin UI and SDK list query serialization.
 */

export type ChefEventCalendarStatus =
  | "pending"
  | "confirmed"
  | "cancelled"
  | "completed"

/** URL / API query param name (comma-separated). */
export const CALENDAR_STATUSES_URL_PARAM = "statuses"

/** Canonical sort order for stable URLs and `statuses` query strings. */
export const CHEF_EVENT_CALENDAR_STATUS_ORDER: readonly ChefEventCalendarStatus[] = [
  "pending",
  "confirmed",
  "cancelled",
  "completed",
] as const

export const DEFAULT_CALENDAR_STATUSES: readonly ChefEventCalendarStatus[] = [
  "pending",
  "confirmed",
] as const

const ORDER_INDEX: Record<ChefEventCalendarStatus, number> = {
  pending: 0,
  confirmed: 1,
  cancelled: 2,
  completed: 3,
}

function isCalendarStatus(value: string): value is ChefEventCalendarStatus {
  return value in ORDER_INDEX
}

export function sortCalendarStatuses(
  statuses: Iterable<ChefEventCalendarStatus>
): ChefEventCalendarStatus[] {
  return [...new Set(statuses)].sort((a, b) => ORDER_INDEX[a] - ORDER_INDEX[b])
}

export function calendarStatusSetsEqual(
  a: readonly ChefEventCalendarStatus[],
  b: readonly ChefEventCalendarStatus[]
): boolean {
  const sa = sortCalendarStatuses(a).join(",")
  const sb = sortCalendarStatuses(b).join(",")
  return sa === sb
}

/**
 * Parse `statuses` from the calendar URL. Invalid tokens are ignored; empty result uses default.
 */
export function parseCalendarStatusesUrlParam(
  raw: string | null | undefined
): ChefEventCalendarStatus[] {
  if (raw === undefined || raw === null || raw.trim() === "") {
    return [...DEFAULT_CALENDAR_STATUSES]
  }
  const parts = raw
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)
  const valid: ChefEventCalendarStatus[] = []
  for (const p of parts) {
    if (isCalendarStatus(p)) {
      valid.push(p)
    }
  }
  const unique = sortCalendarStatuses(valid)
  return unique.length > 0 ? unique : [...DEFAULT_CALENDAR_STATUSES]
}

/**
 * Serialize selected statuses for the URL. Returns `null` when equal to {@link DEFAULT_CALENDAR_STATUSES} (omit param).
 */
export function serializeCalendarStatusesUrlParam(
  statuses: readonly ChefEventCalendarStatus[]
): string | null {
  const sorted = sortCalendarStatuses(statuses)
  if (calendarStatusSetsEqual(sorted, DEFAULT_CALENDAR_STATUSES)) {
    return null
  }
  return sorted.join(",")
}
