import type GoogleCalendarConnectionModuleService from "../../modules/google-calendar-connection/service";
import { toGoogleEventBody } from "./mapping";
import { ensureValidAccessToken } from "./tokens";

type SyncOperation = "upsert" | "cancel";

type SyncInput = {
  chefEvent: Record<string, unknown>;
  operation: SyncOperation;
  googleEventId?: string | null;
};

type GoogleEventResponse = {
  id: string;
  etag?: string;
  updated?: string;
};

function isUsableGoogleEventId(value: unknown): value is string {
  return typeof value === "string" && value.length > 0 && !value.startsWith("pending:");
}

async function createGoogleEvent(
  accessToken: string,
  calendarId: string,
  payload: Record<string, unknown>,
): Promise<GoogleEventResponse> {
  const response = await fetch(
    `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events?sendUpdates=none`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    },
  );

  if (!response.ok) {
    throw new Error(`Google event insert failed: ${await response.text()}`);
  }

  return (await response.json()) as GoogleEventResponse;
}

async function updateGoogleEvent(
  accessToken: string,
  calendarId: string,
  googleEventId: string,
  payload: Record<string, unknown>,
): Promise<GoogleEventResponse> {
  const response = await fetch(
    `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(googleEventId)}?sendUpdates=none`,
    {
      method: "PATCH",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    },
  );

  if (!response.ok) {
    throw new Error(`Google event update failed: ${await response.text()}`);
  }

  return (await response.json()) as GoogleEventResponse;
}

async function cancelGoogleEvent(
  accessToken: string,
  calendarId: string,
  googleEventId: string,
): Promise<GoogleEventResponse> {
  const response = await fetch(
    `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(googleEventId)}?sendUpdates=none`,
    {
      method: "PATCH",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ status: "cancelled" }),
    },
  );

  if (!response.ok) {
    throw new Error(`Google event cancel failed: ${await response.text()}`);
  }

  return (await response.json()) as GoogleEventResponse;
}

export async function syncChefEventRecord(
  svc: GoogleCalendarConnectionModuleService,
  input: SyncInput,
) {
  const connection = await svc.getPrimaryConnection();
  if (!connection?.id) {
    return { skipped: true, reason: "not_connected" as const };
  }

  const chefEventId = String(input.chefEvent.id);
  const syncMap = (await svc.getSyncMapForChefEvent(chefEventId)) as
    | Record<string, unknown>
    | null;
  const mappedGoogleEventId =
    input.googleEventId ||
    syncMap?.googleEventId ||
    syncMap?.google_event_id;
  const calendarId = String(connection.calendarId || "primary");

  const accessToken = await ensureValidAccessToken(
    connection as Record<string, unknown>,
    async (payload) => {
      await svc.updateGoogleCalendarConnections({
        id: connection.id,
        ...payload,
      });
    },
  );

  if (input.operation === "cancel") {
    let cancelledGoogleEventId = String(mappedGoogleEventId || `pending:${chefEventId}`);
    let cancelResult: GoogleEventResponse | null = null;
    if (isUsableGoogleEventId(mappedGoogleEventId)) {
      cancelResult = await cancelGoogleEvent(
        accessToken,
        calendarId,
        mappedGoogleEventId,
      );
      cancelledGoogleEventId = cancelResult.id;
    }

    await svc.upsertSyncMapForChefEvent(chefEventId, {
      googleEventId: cancelledGoogleEventId,
      googleEtag: cancelResult?.etag || null,
      googleUpdatedAt: cancelResult?.updated ? new Date(cancelResult.updated) : null,
      syncState: "cancelled_in_app",
      lastPushedAt: new Date(),
    });
    await svc.updateGoogleCalendarConnections({
      id: connection.id,
      lastSyncedAt: new Date(),
      status: "active",
      lastSyncError: null,
    });
    return { skipped: false, state: "cancelled_in_app" as const };
  }

  const body = toGoogleEventBody(
    input.chefEvent as {
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
    },
    connection.id,
  );

  let googleEvent: GoogleEventResponse;
  if (isUsableGoogleEventId(mappedGoogleEventId)) {
    googleEvent = await updateGoogleEvent(
      accessToken,
      calendarId,
      mappedGoogleEventId,
      body as Record<string, unknown>,
    );
  } else {
    googleEvent = await createGoogleEvent(
      accessToken,
      calendarId,
      body as Record<string, unknown>,
    );
  }

  await svc.upsertSyncMapForChefEvent(chefEventId, {
    googleEventId: googleEvent.id,
    googleEtag: googleEvent.etag || null,
    googleUpdatedAt: googleEvent.updated ? new Date(googleEvent.updated) : null,
    lastAppHash: JSON.stringify(body),
    syncState: "linked",
    lastPushedAt: new Date(),
  });
  await svc.updateGoogleCalendarConnections({
    id: connection.id,
    lastSyncedAt: new Date(),
    status: "active",
    lastSyncError: null,
  });

  return { skipped: false, state: "linked" as const };
}
