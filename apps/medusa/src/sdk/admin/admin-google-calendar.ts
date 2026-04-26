import type { Client } from "@medusajs/js-sdk";

export type GoogleCalendarStatus =
  | "not_connected"
  | "active"
  | "reauthorization_required"
  | "sync_error";

export type GoogleCalendarIncident = {
  id: string;
  chefEventId: string;
  googleEventId: string;
  incidentType: "google_cancelled_ignored";
  createdAt: string | null;
  googleUpdatedAt: string | null;
  payload: Record<string, unknown> | null;
};

export interface GoogleCalendarStatusResponse {
  connected: boolean;
  status: GoogleCalendarStatus;
  calendarId: string | null;
  watchExpiresAt: string | null;
  lastSyncedAt: string | null;
  lastSyncError: string | null;
  pendingIncidents: GoogleCalendarIncident[];
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
    return this.client.fetch<{
      started: boolean;
      scheduled: number;
      totalChefEvents: number;
      windowStart: string;
      windowEnd: string;
    }>("/admin/google-calendar/resync", {
      method: "POST",
    });
  }

  async approveIncident(id: string) {
    return this.client.fetch<{ resolved: boolean; action: "approved" }>(
      `/admin/google-calendar/incidents/${id}/approve`,
      {
        method: "POST",
      },
    );
  }

  async denyIncident(id: string) {
    return this.client.fetch<{ resolved: boolean; action: "denied" }>(
      `/admin/google-calendar/incidents/${id}/deny`,
      {
        method: "POST",
      },
    );
  }
}
