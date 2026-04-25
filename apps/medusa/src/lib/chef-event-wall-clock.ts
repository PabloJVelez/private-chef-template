import { DateTime } from "luxon";

export function isValidIanaZone(zone: string): boolean {
  return DateTime.fromObject({ year: 2020, month: 1, day: 1 }, { zone }).isValid;
}

export function resolveEventZone(
  googleStartTz: string | undefined | null,
  chefTimeZone: unknown,
  fallback: string,
): string {
  const fromGoogle =
    typeof googleStartTz === "string" && googleStartTz.length > 0
      ? googleStartTz
      : null;
  if (fromGoogle && isValidIanaZone(fromGoogle)) {
    return fromGoogle;
  }
  const fromChef =
    typeof chefTimeZone === "string" && chefTimeZone.length > 0
      ? chefTimeZone
      : null;
  if (fromChef && isValidIanaZone(fromChef)) {
    return fromChef;
  }
  return isValidIanaZone(fallback) ? fallback : "UTC";
}

/**
 * UTC instant for a calendar date + clock in `zone` (never parse YYYY-MM-DD with `Date` alone).
 */
export function wallClockToUtcJsDate(
  calendarIsoDate: string,
  hhmm: string,
  zone: string,
): Date | null {
  const parts = calendarIsoDate.split("-").map(Number);
  const y = parts[0];
  const mo = parts[1];
  const d = parts[2];
  if (!y || !mo || !d) {
    return null;
  }
  const [hhRaw, mmRaw] = String(hhmm || "00:00").split(":");
  const hh = Number(hhRaw);
  const mm = Number(mmRaw);
  const dt = DateTime.fromObject(
    {
      year: y,
      month: mo,
      day: d,
      hour: Number.isFinite(hh) ? hh : 0,
      minute: Number.isFinite(mm) ? mm : 0,
      second: 0,
      millisecond: 0,
    },
    { zone },
  );
  if (!dt.isValid) {
    return null;
  }
  return dt.toUTC().toJSDate();
}
