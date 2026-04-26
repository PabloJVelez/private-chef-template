import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http";
import { GOOGLE_CALENDAR_CONNECTION_MODULE } from "../../../modules/google-calendar-connection";
import type GoogleCalendarConnectionModuleService from "../../../modules/google-calendar-connection/service";

export async function GET(
  req: MedusaRequest,
  res: MedusaResponse,
): Promise<void> {
  const svc = req.scope.resolve(
    GOOGLE_CALENDAR_CONNECTION_MODULE,
  ) as GoogleCalendarConnectionModuleService;

  const connection = await svc.getPrimaryConnection();
  if (!connection) {
    res.status(200).json({
      connected: false,
      status: "not_connected",
      calendarId: null,
      watchExpiresAt: null,
      lastSyncedAt: null,
      lastSyncError: null,
      pendingIncidents: [],
    });
    return;
  }

  // Watch registration / renewal happens out-of-band via the
  // `renew-google-calendar-watch` cron job. The status endpoint stays
  // idempotent and read-only.
  const incidents = await svc.listPendingCancellationIncidents(20);

  res.status(200).json({
    connected: true,
    status: connection.status,
    calendarId: connection.calendarId ?? "primary",
    watchExpiresAt: connection.watchExpiresAt ?? null,
    lastSyncedAt: connection.lastSyncedAt ?? null,
    lastSyncError: connection.lastSyncError ?? null,
    pendingIncidents: incidents.map((incident) => ({
      id: String(incident.id),
      chefEventId: String(incident.chefEventId ?? incident.chef_event_id ?? ""),
      googleEventId: String(
        incident.googleEventId ?? incident.google_event_id ?? "",
      ),
      incidentType: String(
        incident.incidentType ?? incident.incident_type ?? "google_cancelled_ignored",
      ),
      createdAt: incident.created_at ?? incident.createdAt ?? null,
      googleUpdatedAt: incident.googleUpdatedAt ?? incident.google_updated_at ?? null,
      payload: (incident.payload as Record<string, unknown> | null) ?? null,
    })),
  });
}

export async function DELETE(
  req: MedusaRequest,
  res: MedusaResponse,
): Promise<void> {
  const svc = req.scope.resolve(
    GOOGLE_CALENDAR_CONNECTION_MODULE,
  ) as GoogleCalendarConnectionModuleService;
  const deleted = await svc.clearPrimaryConnection();
  res.status(200).json({ deleted });
}
