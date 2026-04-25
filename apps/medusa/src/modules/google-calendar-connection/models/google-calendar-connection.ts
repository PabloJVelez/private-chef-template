import { model } from "@medusajs/framework/utils";

export const GoogleCalendarConnection = model.define(
  "google_calendar_connection",
  {
    id: model.id().primaryKey(),
    adminUserId: model.text(),
    calendarId: model.text().default("primary"),
    scope: model.text(),
    accessTokenEnc: model.text().nullable(),
    refreshTokenEnc: model.text().nullable(),
    accessTokenExpiresAt: model.dateTime().nullable(),
    watchChannelId: model.text().nullable(),
    watchResourceId: model.text().nullable(),
    watchExpiresAt: model.dateTime().nullable(),
    nextSyncToken: model.text().nullable(),
    status: model
      .enum(["not_connected", "active", "reauthorization_required", "sync_error"])
      .default("not_connected"),
    lastSyncedAt: model.dateTime().nullable(),
    lastSyncError: model.text().nullable(),
  },
);

export default GoogleCalendarConnection;
