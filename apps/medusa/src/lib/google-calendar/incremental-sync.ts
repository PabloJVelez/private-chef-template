import { DateTime } from "luxon";
import type GoogleCalendarConnectionModuleService from "../../modules/google-calendar-connection/service";
import {
  isValidIanaZone,
  resolveEventZone,
  wallClockToUtcJsDate,
} from "../chef-event-wall-clock";
import { ensureValidAccessToken } from "./tokens";

type GoogleEvent = {
  id: string;
  etag?: string;
  status?: string;
  updated?: string;
  summary?: string;
  location?: string;
  description?: string;
  start?: { date?: string; dateTime?: string; timeZone?: string };
  end?: { date?: string; dateTime?: string; timeZone?: string };
  extendedProperties?: {
    private?: Record<string, string>;
  };
};

type GoogleEventsListResponse = {
  items?: GoogleEvent[];
  nextPageToken?: string;
  nextSyncToken?: string;
};

function parseGoogleUpdatedAt(updated?: string): Date | null {
  if (!updated) {
    return null;
  }
  const parsed = Date.parse(updated);
  if (!Number.isFinite(parsed)) {
    return null;
  }
  return new Date(parsed);
}

function toRequestedDateAndTime(
  dateTime?: string,
  eventTimeZone?: string | null,
) {
  if (!dateTime) {
    return null;
  }
  const dt = DateTime.fromISO(dateTime, { setZone: true });
  if (!dt.isValid) {
    return null;
  }
  const zoned =
    eventTimeZone && isValidIanaZone(eventTimeZone)
      ? dt.setZone(eventTimeZone)
      : dt;
  return {
    requestedDate: zoned.toISODate(),
    requestedTime: zoned.toFormat("HH:mm"),
  };
}

function toEstimatedDurationMinutes(start?: string, end?: string) {
  if (!start || !end) {
    return undefined;
  }
  const startDt = DateTime.fromISO(start);
  const endDt = DateTime.fromISO(end);
  if (!startDt.isValid || !endDt.isValid) {
    return undefined;
  }
  const diff = Math.round(endDt.diff(startDt, "minutes").minutes);
  return diff > 0 ? diff : undefined;
}

async function applyGoogleEventToChefEvent(
  googleSvc: GoogleCalendarConnectionModuleService,
  chefEventService: any,
  event: GoogleEvent,
) {
  const privateProps = event.extendedProperties?.private || {};
  const chefEventId = privateProps.chefEventId;
  if (!chefEventId) {
    return;
  }

  const chefEvent = await chefEventService.retrieveChefEvent(chefEventId);
  if (!chefEvent) {
    return;
  }

  const googleUpdated = parseGoogleUpdatedAt(event.updated);
  const appUpdated = chefEvent.updated_at
    ? new Date(chefEvent.updated_at)
    : chefEvent.updatedAt
      ? new Date(chefEvent.updatedAt)
      : null;

  const syncMap = (await googleSvc.getSyncMapForChefEvent(chefEventId)) as
    | Record<string, unknown>
    | null;
  const lastPushedAtRaw =
    syncMap?.lastPushedAt ?? syncMap?.last_pushed_at ?? null;
  const lastPushedAt =
    lastPushedAtRaw instanceof Date
      ? lastPushedAtRaw
      : typeof lastPushedAtRaw === "string"
        ? new Date(lastPushedAtRaw)
        : null;

  const appUpdatedMs = appUpdated ? appUpdated.getTime() : NaN;
  const lastPushedMs = lastPushedAt ? lastPushedAt.getTime() : NaN;
  const googleUpdatedMs = googleUpdated ? googleUpdated.getTime() : NaN;

  const googleIsNewerThanLastAppPush =
    Number.isFinite(googleUpdatedMs) &&
    Number.isFinite(lastPushedMs) &&
    googleUpdatedMs > lastPushedMs;

  const googleIsNewerOrEqualAppRecord =
    Number.isFinite(googleUpdatedMs) &&
    Number.isFinite(appUpdatedMs) &&
    googleUpdatedMs >= appUpdatedMs;

  const googleWins =
    !googleUpdated ||
    !Number.isFinite(appUpdatedMs) ||
    googleIsNewerThanLastAppPush ||
    googleIsNewerOrEqualAppRecord;

  await googleSvc.upsertSyncMapForChefEvent(chefEventId, {
    googleEventId: event.id,
    googleEtag: event.etag || null,
    googleUpdatedAt: googleUpdated,
    lastPulledAt: new Date(),
    syncState: event.status === "cancelled" ? "cancelled_in_google" : "linked",
  });

  if (!googleWins) {
    return;
  }

  const fallbackTz = googleSvc.getConfig().defaultTimezone;
  const zone = resolveEventZone(
    event.start?.timeZone,
    chefEvent.timeZone,
    fallbackTz,
  );

  let requested: { requestedDate: string | null; requestedTime: string } | null =
    null;
  if (event.start?.dateTime) {
    requested = toRequestedDateAndTime(event.start.dateTime, zone);
  } else if (event.start?.date) {
    requested = {
      requestedDate: event.start.date,
      requestedTime: "00:00",
    };
  }

  const estimatedDuration = toEstimatedDurationMinutes(
    event.start?.dateTime,
    event.end?.dateTime,
  );

  const updatePayload: Record<string, unknown> = {
    id: chefEventId,
  };

  if (requested?.requestedDate) {
    const asDate = wallClockToUtcJsDate(
      requested.requestedDate,
      requested.requestedTime || "00:00",
      zone,
    );
    if (asDate) {
      updatePayload.requestedDate = asDate;
    }
  }
  if (requested?.requestedTime) {
    updatePayload.requestedTime = requested.requestedTime;
  }
  if (event.start?.timeZone) {
    updatePayload.timeZone = event.start.timeZone;
  }
  if (typeof estimatedDuration === "number") {
    updatePayload.estimatedDuration = estimatedDuration;
  }
  if (typeof event.location === "string") {
    updatePayload.locationAddress = event.location;
  }
  if (typeof event.description === "string") {
    updatePayload.notes = event.description;
  }
  if (event.status === "cancelled") {
    updatePayload.status = "cancelled";
  }

  await chefEventService.updateChefEvents(updatePayload);
}

export async function runIncrementalSync(
  googleSvc: GoogleCalendarConnectionModuleService,
  chefEventService: any,
) {
  const connection = await googleSvc.getPrimaryConnection();
  if (!connection?.id) {
    return { synced: false, reason: "not_connected" as const };
  }

  const accessToken = await ensureValidAccessToken(
    connection as Record<string, unknown>,
    async (payload) => {
      await googleSvc.updateGoogleCalendarConnections({
        id: connection.id,
        ...payload,
      });
    },
  );

  const calendarId = connection.calendarId || "primary";
  let nextSyncToken = connection.nextSyncToken || undefined;
  let pageToken: string | undefined;
  let retriedAfter410 = false;

  while (true) {
    const url = new URL(
      `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events`,
    );
    url.searchParams.set("maxResults", "250");
    url.searchParams.set("singleEvents", "true");
    if (nextSyncToken) {
      url.searchParams.set("syncToken", nextSyncToken);
    }
    if (pageToken) {
      url.searchParams.set("pageToken", pageToken);
    }

    const response = await fetch(url.toString(), {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    });

    if (response.status === 410 && !retriedAfter410) {
      retriedAfter410 = true;
      nextSyncToken = undefined;
      pageToken = undefined;
      await googleSvc.updateGoogleCalendarConnections({
        id: connection.id,
        nextSyncToken: null,
        lastSyncError: null,
      });
      continue;
    }

    if (!response.ok) {
      const errorText = await response.text();
      await googleSvc.updateGoogleCalendarConnections({
        id: connection.id,
        status: "sync_error",
        lastSyncError: errorText,
      });
      throw new Error(`Google incremental sync failed: ${errorText}`);
    }

    const json = (await response.json()) as GoogleEventsListResponse;
    const items = json.items || [];

    for (const event of items) {
      await applyGoogleEventToChefEvent(googleSvc, chefEventService, event);
    }

    pageToken = json.nextPageToken;
    if (!pageToken) {
      if (json.nextSyncToken) {
        await googleSvc.updateGoogleCalendarConnections({
          id: connection.id,
          nextSyncToken: json.nextSyncToken,
          lastSyncedAt: new Date(),
          status: "active",
          lastSyncError: null,
        });
      }
      break;
    }
  }

  return { synced: true as const };
}
