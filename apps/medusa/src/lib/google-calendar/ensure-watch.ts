import { randomUUID } from "node:crypto";
import type { MedusaContainer } from "@medusajs/framework/types";
import { ContainerRegistrationKeys } from "@medusajs/framework/utils";
import { CHEF_EVENT_MODULE } from "../../modules/chef-event";
import type GoogleCalendarConnectionModuleService from "../../modules/google-calendar-connection/service";
import type ChefEventModuleService from "../../modules/chef-event/service";
import { ensureValidAccessToken } from "./tokens";
import { startOrRenewCalendarWatch, stopCalendarWatch } from "./watch";
import { runIncrementalSync } from "./incremental-sync";

type Logger = {
  info: (msg: string) => void;
  warn: (msg: string) => void;
  error: (msg: string) => void;
};

/**
 * Idempotently registers (or renews) the Google Calendar push channel and
 * optionally bootstraps an incremental sync. Accepts a Medusa container so
 * it can be called from HTTP routes, jobs, or subscribers.
 */
export async function ensureGoogleCalendarWatchAndBootstrapSync(
  container: MedusaContainer,
  googleSvc: GoogleCalendarConnectionModuleService,
  options?: { skipIncrementalSync?: boolean },
): Promise<void> {
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER) as Logger;

  const config = googleSvc.getConfig();
  if (!config.webhookUrl) {
    logger.warn(
      "GOOGLE_CALENDAR_WEBHOOK_URL is not set; Google->app sync will not receive push notifications.",
    );
    return;
  }

  const connection = await googleSvc.getPrimaryConnection();
  if (!connection?.id) {
    return;
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

  if (connection.watchChannelId && connection.watchResourceId) {
    try {
      await stopCalendarWatch({
        accessToken,
        channelId: String(connection.watchChannelId),
        resourceId: String(connection.watchResourceId),
      });
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Unknown channels.stop error";
      logger.warn(`Failed to stop previous Google Calendar watch: ${message}`);
    }
  }

  const channelId = randomUUID();
  const watch = await startOrRenewCalendarWatch({
    accessToken,
    calendarId: connection.calendarId || "primary",
    webhookUrl: config.webhookUrl,
    channelId,
    channelToken: config.channelToken || "",
  });

  const expirationMs = watch.expiration ? Number(watch.expiration) : NaN;
  const watchExpiresAt = Number.isFinite(expirationMs)
    ? new Date(expirationMs)
    : null;

  await googleSvc.updateGoogleCalendarConnections({
    id: connection.id,
    watchChannelId: watch.id,
    watchResourceId: watch.resourceId,
    watchExpiresAt,
    lastSyncError: null,
  });

  if (options?.skipIncrementalSync) {
    logger.info("Google Calendar watch registered.");
    return;
  }

  const chefEventService = container.resolve(
    CHEF_EVENT_MODULE,
  ) as ChefEventModuleService;
  try {
    await runIncrementalSync(googleSvc, chefEventService, logger);
    logger.info(
      "Google Calendar watch registered and incremental sync completed.",
    );
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unknown incremental sync error";
    logger.error(
      `Google Calendar watch registered but incremental sync failed: ${message}`,
    );
  }
}
