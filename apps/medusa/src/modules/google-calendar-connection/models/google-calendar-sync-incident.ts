import { model } from "@medusajs/framework/utils";

export const GoogleCalendarSyncIncident = model.define(
  "google_calendar_sync_incident",
  {
    id: model.id().primaryKey(),
    connectionId: model.text(),
    chefEventId: model.text(),
    googleEventId: model.text(),
    incidentType: model
      .enum(["google_cancelled_ignored"])
      .default("google_cancelled_ignored"),
    status: model.enum(["pending", "approved", "denied"]).default("pending"),
    googleUpdatedAt: model.dateTime().nullable(),
    payload: model.json().nullable(),
    resolvedAt: model.dateTime().nullable(),
    resolvedBy: model.text().nullable(),
  },
);

export default GoogleCalendarSyncIncident;
