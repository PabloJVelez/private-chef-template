import { DateTime } from "luxon";
import type { Settings } from "../../lib/availability/slots";

/** Global working hours only. No experience notice rule, recurrence horizon,
 * method-window precedence or external-calendar policy is inferred here.
 * Walk the real timeline so DST folds/gaps and partial minutes stay explicit.
 */
export function withinGlobalHours(
  start: string,
  end: string,
  settings: Settings,
): boolean {
  const from = Date.parse(start),
    to = Date.parse(end);
  if (!Number.isFinite(from) || !Number.isFinite(to) || to <= from)
    return false;
  for (let at = from; at < to; at = Math.floor(at / 60000) * 60000 + 60000) {
    const local = DateTime.fromMillis(at, { zone: settings.timezone });
    const windows =
      settings.overrides[local.toISODate()!] ??
      settings.weekly[String(local.weekday) as keyof Settings["weekly"]] ??
      [];
    const clock = local.toFormat("HH:mm");
    if (!windows.some((w) => clock >= w.start && clock < w.end)) return false;
  }
  return true;
}
