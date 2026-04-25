import { model } from "@medusajs/framework/utils";

export const GoogleCalendarSyncMap = model.define("google_calendar_sync_map", {
  id: model.id().primaryKey(),
  connectionId: model.text(),
  chefEventId: model.text(),
  googleEventId: model.text(),
  googleEtag: model.text().nullable(),
  googleUpdatedAt: model.dateTime().nullable(),
  lastAppHash: model.text().nullable(),
  lastPushedAt: model.dateTime().nullable(),
  lastPulledAt: model.dateTime().nullable(),
  syncState: model
    .enum(["linked", "cancelled_in_app", "cancelled_in_google", "sync_error"])
    .default("linked"),
});

export default GoogleCalendarSyncMap;
