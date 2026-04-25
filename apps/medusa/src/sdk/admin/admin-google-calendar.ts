import type { Client } from "@medusajs/js-sdk";

export type GoogleCalendarStatus =
  | "not_connected"
  | "active"
  | "reauthorization_required"
  | "sync_error";

export interface GoogleCalendarStatusResponse {
  connected: boolean;
  status: GoogleCalendarStatus;
  calendarId: string | null;
  watchExpiresAt: string | null;
  lastSyncedAt: string | null;
  lastSyncError: string | null;
}

export class AdminGoogleCalendarResource {
  constructor(private client: Client) {}

  async getStatus() {
    return this.client.fetch<GoogleCalendarStatusResponse>(
      "/admin/google-calendar",
      { method: "GET" },
    );
  }

  async connect() {
    return this.client.fetch<{ url: string }>("/admin/google-calendar/connect", {
      method: "POST",
    });
  }

  async disconnect() {
    return this.client.fetch<{ deleted: boolean }>("/admin/google-calendar", {
      method: "DELETE",
    });
  }

  async resync() {
    return this.client.fetch<{ started: boolean }>("/admin/google-calendar/resync", {
      method: "POST",
    });
  }
}
