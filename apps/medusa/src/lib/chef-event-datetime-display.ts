import { DateTime } from "luxon";
import { resolveEventZone } from "./chef-event-wall-clock";

/** Admin UI + API payloads may omit env; matches `chef_event.timeZone` default. */
const DISPLAY_TZ_FALLBACK = "America/Chicago";

export function resolveChefEventDisplayZone(record: {
  timeZone?: string | null;
  time_zone?: string | null;
}): string {
  return resolveEventZone(
    null,
    record.timeZone ?? record.time_zone,
    DISPLAY_TZ_FALLBACK,
  );
}

/**
 * Interprets stored `requestedDate` (UTC instant) in the event’s IANA zone.
 * Use this for calendar placement and form fields — never `toISOString().split("T")[0])`.
 */
export function requestedStartInEventZone(record: {
  requestedDate?: string | Date | null;
  timeZone?: string | null;
  time_zone?: string | null;
}): DateTime {
  const tz = resolveChefEventDisplayZone(record);
  const rd = record.requestedDate;
  if (rd == null || rd === "") {
    return DateTime.invalid("missing requestedDate");
  }
  return DateTime.fromJSDate(new Date(rd as string | Date)).setZone(tz);
}

export function formDateAndTimeFromRequestedInstant(record: {
  requestedDate?: string | Date | null;
  timeZone?: string | null;
  time_zone?: string | null;
}): { requestedDate: string; requestedTime: string } {
  const dt = requestedStartInEventZone(record);
  if (!dt.isValid) {
    return { requestedDate: "", requestedTime: "" };
  }
  return {
    requestedDate: dt.toFormat("yyyy-MM-dd"),
    requestedTime: dt.toFormat("HH:mm"),
  };
}
