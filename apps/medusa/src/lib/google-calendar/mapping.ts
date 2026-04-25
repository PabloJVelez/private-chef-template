import { DateTime } from "luxon";
import { resolveEventZone } from "../chef-event-wall-clock";
import { chefEventStatusToGoogleColorId } from "../chef-event-google-calendar-colors";

type ChefEventShape = {
  id: string;
  status?: string | null;
  firstName?: string;
  lastName?: string;
  eventType?: string;
  locationAddress?: string;
  notes?: string;
  requestedDate?: string | Date;
  requestedTime?: string;
  estimatedDuration?: number | null;
  timeZone?: string | null;
  updated_at?: string | Date;
  updatedAt?: string | Date;
};

export function toGoogleDateTimes(event: ChefEventShape) {
  const fallbackTz =
    process.env.GOOGLE_CALENDAR_DEFAULT_TIMEZONE ?? "America/Chicago";
  const timezone = resolveEventZone(null, event.timeZone, fallbackTz);
  const durationMin = Number(event.estimatedDuration || 60);

  const [h, m] = String(event.requestedTime || "00:00")
    .split(":")
    .map(Number);

  let start: DateTime;
  if (event.requestedDate) {
    // `requestedDate` is stored as a UTC instant for the intended wall time in `timezone`
    start = DateTime.fromJSDate(
      new Date(event.requestedDate as string | Date),
    ).setZone(timezone);
  } else {
    start = DateTime.now()
      .setZone(timezone)
      .set({
        hour: Number.isFinite(h) ? h : 0,
        minute: Number.isFinite(m) ? m : 0,
        second: 0,
        millisecond: 0,
      });
  }

  const end = start.plus({ minutes: durationMin });

  return {
    start: {
      dateTime: start.toISO({ suppressMilliseconds: true }) ?? start.toISO(),
      timeZone: timezone,
    },
    end: {
      dateTime: end.toISO({ suppressMilliseconds: true }) ?? end.toISO(),
      timeZone: timezone,
    },
  };
}

export function toGoogleEventBody(event: ChefEventShape, connectionId: string) {
  const fullName = [event.firstName, event.lastName].filter(Boolean).join(" ").trim();
  const summary =
    fullName || event.eventType
      ? `${event.eventType || "Chef Event"} - ${fullName || "Customer"}`
      : "Chef Event";

  return {
    summary,
    location: event.locationAddress || "",
    description: event.notes || "",
    colorId: chefEventStatusToGoogleColorId(event.status),
    ...toGoogleDateTimes(event),
    extendedProperties: {
      private: {
        app: "private-chef-template",
        chefEventId: event.id,
        connectionId,
        appUpdatedAt: new Date(
          (event.updated_at as string) || (event.updatedAt as string) || Date.now(),
        ).toISOString(),
      },
    },
  };
}
