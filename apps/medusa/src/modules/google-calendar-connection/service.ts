import { MedusaService } from "@medusajs/framework/utils";
import type { GoogleCalendarConnectionModuleOptions } from "./index";
import GoogleCalendarConnection from "./models/google-calendar-connection";
import GoogleCalendarSyncMap from "./models/google-calendar-sync-map";
import GoogleCalendarSyncIncident from "./models/google-calendar-sync-incident";

class GoogleCalendarConnectionModuleService extends MedusaService({
  GoogleCalendarConnection,
  GoogleCalendarSyncMap,
  GoogleCalendarSyncIncident,
}) {
  protected readonly options_: GoogleCalendarConnectionModuleOptions;

  constructor(container: unknown, options?: GoogleCalendarConnectionModuleOptions) {
    super(container, options);
    this.options_ = options ?? {};
  }

  getConfig() {
    return {
      clientId: this.options_.clientId ?? process.env.GOOGLE_CALENDAR_CLIENT_ID,
      clientSecret:
        this.options_.clientSecret ?? process.env.GOOGLE_CALENDAR_CLIENT_SECRET,
      redirectUri:
        this.options_.redirectUri ?? process.env.GOOGLE_CALENDAR_REDIRECT_URI,
      webhookUrl:
        this.options_.webhookUrl ?? process.env.GOOGLE_CALENDAR_WEBHOOK_URL,
      scope:
        this.options_.scope ??
        process.env.GOOGLE_CALENDAR_SCOPE ??
        "https://www.googleapis.com/auth/calendar.events",
      signingSecret:
        this.options_.signingSecret ??
        process.env.GOOGLE_CALENDAR_SIGNING_SECRET,
      tokenEncryptionKey:
        this.options_.tokenEncryptionKey ??
        process.env.GOOGLE_CALENDAR_TOKEN_ENCRYPTION_KEY,
      defaultTimezone:
        this.options_.defaultTimezone ??
        process.env.GOOGLE_CALENDAR_DEFAULT_TIMEZONE ??
        "America/Chicago",
    };
  }

  async getPrimaryConnection() {
    const [connection] = await this.listGoogleCalendarConnections(
      {},
      { take: 1 },
    );
    return connection ?? null;
  }

  async upsertPrimaryConnection(
    payload: Record<string, unknown>,
  ): Promise<Record<string, unknown>> {
    const existing = await this.getPrimaryConnection();
    if (existing?.id) {
      const updated = await this.updateGoogleCalendarConnections({
        id: existing.id,
        ...(payload as Record<string, unknown>),
      });
      return Array.isArray(updated) ? (updated[0] as Record<string, unknown>) : (updated as Record<string, unknown>);
    }

    const created = await this.createGoogleCalendarConnections({
      adminUserId: "single-admin",
      calendarId: "primary",
      ...(payload as Record<string, unknown>),
    });
    return Array.isArray(created) ? (created[0] as Record<string, unknown>) : (created as Record<string, unknown>);
  }

  async clearPrimaryConnection(): Promise<boolean> {
    const existing = await this.getPrimaryConnection();
    if (!existing?.id) {
      return false;
    }
    await this.deleteGoogleCalendarConnections(existing.id);
    return true;
  }

  async upsertSyncMapForChefEvent(
    chefEventId: string,
    payload: Record<string, unknown>,
  ): Promise<Record<string, unknown>> {
    const connection = await this.getPrimaryConnection();
    if (!connection?.id) {
      throw new Error("No active Google Calendar connection found");
    }

    const [existing] = await this.listGoogleCalendarSyncMaps(
      {
        connectionId: connection.id,
        chefEventId,
      },
      { take: 1 },
    );

    if (existing?.id) {
      const updated = await this.updateGoogleCalendarSyncMaps({
        id: existing.id,
        ...(payload as Record<string, unknown>),
      });
      return Array.isArray(updated)
        ? (updated[0] as Record<string, unknown>)
        : (updated as Record<string, unknown>);
    }

    const created = await this.createGoogleCalendarSyncMaps({
      connectionId: connection.id,
      chefEventId,
      googleEventId: String(payload.googleEventId ?? `pending:${chefEventId}`),
      ...(payload as Record<string, unknown>),
    });
    return Array.isArray(created)
      ? (created[0] as Record<string, unknown>)
      : (created as Record<string, unknown>);
  }

  async getSyncMapForChefEvent(
    chefEventId: string,
  ): Promise<Record<string, unknown> | null> {
    const connection = await this.getPrimaryConnection();
    if (!connection?.id) {
      return null;
    }

    const [existing] = await this.listGoogleCalendarSyncMaps(
      {
        connectionId: connection.id,
        chefEventId,
      },
      { take: 1 },
    );
    return (existing as Record<string, unknown>) || null;
  }

  async getSyncMapForGoogleEventId(
    googleEventId: string,
  ): Promise<Record<string, unknown> | null> {
    const connection = await this.getPrimaryConnection();
    if (!connection?.id || !googleEventId) {
      return null;
    }

    const [existing] = await this.listGoogleCalendarSyncMaps(
      {
        connectionId: connection.id,
        googleEventId,
      },
      { take: 1 },
    );
    return (existing as Record<string, unknown>) || null;
  }

  async createOrUpdatePendingCancellationIncident(input: {
    chefEventId: string;
    googleEventId: string;
    googleUpdatedAt?: Date | null;
    payload?: Record<string, unknown> | null;
  }): Promise<Record<string, unknown>> {
    const connection = await this.getPrimaryConnection();
    if (!connection?.id) {
      throw new Error("No active Google Calendar connection found");
    }

    const [existingPending] = await this.listGoogleCalendarSyncIncidents(
      {
        connectionId: connection.id,
        chefEventId: input.chefEventId,
        incidentType: "google_cancelled_ignored",
        status: "pending",
      },
      { take: 1 },
    );

    if (existingPending?.id) {
      const updated = await this.updateGoogleCalendarSyncIncidents({
        id: existingPending.id,
        googleEventId: input.googleEventId,
        googleUpdatedAt: input.googleUpdatedAt ?? null,
        payload: input.payload ?? null,
      });
      return Array.isArray(updated)
        ? (updated[0] as Record<string, unknown>)
        : (updated as Record<string, unknown>);
    }

    const created = await this.createGoogleCalendarSyncIncidents({
      connectionId: connection.id,
      chefEventId: input.chefEventId,
      googleEventId: input.googleEventId,
      incidentType: "google_cancelled_ignored",
      status: "pending",
      googleUpdatedAt: input.googleUpdatedAt ?? null,
      payload: input.payload ?? null,
    });
    return Array.isArray(created)
      ? (created[0] as Record<string, unknown>)
      : (created as Record<string, unknown>);
  }

  async listPendingCancellationIncidents(
    take = 50,
  ): Promise<Record<string, unknown>[]> {
    const connection = await this.getPrimaryConnection();
    if (!connection?.id) {
      return [];
    }
    const incidents = await this.listGoogleCalendarSyncIncidents(
      {
        connectionId: connection.id,
        incidentType: "google_cancelled_ignored",
        status: "pending",
      },
      {
        take,
      },
    );
    return incidents as Record<string, unknown>[];
  }

  async getIncidentById(id: string): Promise<Record<string, unknown> | null> {
    const [incident] = await this.listGoogleCalendarSyncIncidents(
      { id },
      { take: 1 },
    );
    return (incident as Record<string, unknown>) || null;
  }

  async resolveIncident(
    id: string,
    input: { status: "approved" | "denied"; resolvedBy?: string | null },
  ): Promise<Record<string, unknown>> {
    const updated = await this.updateGoogleCalendarSyncIncidents({
      id,
      status: input.status,
      resolvedAt: new Date(),
      resolvedBy: input.resolvedBy ?? null,
    });
    return Array.isArray(updated)
      ? (updated[0] as Record<string, unknown>)
      : (updated as Record<string, unknown>);
  }
}

export default GoogleCalendarConnectionModuleService;
