import type { MedusaContainer } from "@medusajs/framework/types";
import { ContainerRegistrationKeys } from "@medusajs/framework/utils";
import { GOOGLE_CALENDAR_CONNECTION_MODULE } from "../modules/google-calendar-connection";
import type GoogleCalendarConnectionModuleService from "../modules/google-calendar-connection/service";
import { ensureGoogleCalendarWatchAndBootstrapSync } from "../lib/google-calendar/ensure-watch";

const RENEWAL_THRESHOLD_MS = 24 * 60 * 60 * 1000;

/**
 * Google Calendar push channels expire after up to ~7 days. This job runs
 * every 6 hours and renews the watch when there is no active channel or the
 * existing one is within 24h of expiration. Without it, push notifications
 * silently stop and bidirectional sync degrades to manual `Resync` only.
 */
export default async function renewGoogleCalendarWatchJob(
  container: MedusaContainer,
): Promise<void> {
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER);

  const svc = container.resolve(
    GOOGLE_CALENDAR_CONNECTION_MODULE,
  ) as GoogleCalendarConnectionModuleService;

  const connection = await svc.getPrimaryConnection();
  if (!connection?.id) {
    return;
  }

  if (connection.status !== "active") {
    logger.info(
      `[job:renew-google-calendar-watch] connection status is ${connection.status}; skipping renewal`,
    );
    return;
  }

  const expiresAtRaw = connection.watchExpiresAt;
  const expiresAt = expiresAtRaw ? new Date(expiresAtRaw).getTime() : 0;
  const needsRenewal =
    !connection.watchChannelId ||
    !expiresAt ||
    expiresAt - Date.now() < RENEWAL_THRESHOLD_MS;

  if (!needsRenewal) {
    return;
  }

  try {
    await ensureGoogleCalendarWatchAndBootstrapSync(container, svc, {
      skipIncrementalSync: true,
    });
    logger.info("[job:renew-google-calendar-watch] watch renewed");
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unknown watch renewal error";
    logger.error(
      `[job:renew-google-calendar-watch] watch renewal failed: ${message}`,
    );
    await svc.updateGoogleCalendarConnections({
      id: connection.id,
      lastSyncError: message,
      status: "sync_error",
    });
  }
}

export const config = {
  name: "renew-google-calendar-watch",
  schedule: "0 */6 * * *",
};
