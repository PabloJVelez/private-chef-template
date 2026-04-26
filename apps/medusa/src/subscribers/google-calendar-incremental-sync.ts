import type {
  SubscriberArgs,
  SubscriberConfig,
} from "@medusajs/medusa";
import {
  ContainerRegistrationKeys,
  Modules,
} from "@medusajs/framework/utils";
import { CHEF_EVENT_MODULE } from "../modules/chef-event";
import type ChefEventModuleService from "../modules/chef-event/service";
import { GOOGLE_CALENDAR_CONNECTION_MODULE } from "../modules/google-calendar-connection";
import type GoogleCalendarConnectionModuleService from "../modules/google-calendar-connection/service";
import { runIncrementalSync } from "../lib/google-calendar/incremental-sync";

const LOCK_KEY = "google-calendar:incremental-sync:lock";
const LOCK_TTL_SECONDS = 60;

type CacheService = {
  get<T>(key: string): Promise<T | null>;
  set(key: string, data: unknown, ttl?: number): Promise<void>;
  invalidate(key: string): Promise<void>;
};

/**
 * Drives the Google -> app pull sync triggered by webhook pushes or manual
 * resync. We use a best-effort cache-backed lock to coalesce overlapping runs;
 * the underlying `runIncrementalSync` already recovers from 410 by forcing a
 * full resync, so a missed lock is degraded behavior, not data loss.
 */
export default async function googleCalendarIncrementalSyncHandler({
  container,
}: SubscriberArgs<unknown>) {
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER);
  const cache = container.resolve(Modules.CACHE) as CacheService;
  const googleSvc = container.resolve(
    GOOGLE_CALENDAR_CONNECTION_MODULE,
  ) as GoogleCalendarConnectionModuleService;
  const chefEventService = container.resolve(
    CHEF_EVENT_MODULE,
  ) as ChefEventModuleService;

  let acquired = false;
  try {
    const existing = await cache.get<string>(LOCK_KEY);
    if (existing) {
      logger.info(
        "[subscriber:google-calendar-incremental-sync] another run holds the lock; skipping",
      );
      return;
    }
    await cache.set(LOCK_KEY, "1", LOCK_TTL_SECONDS);
    acquired = true;

    await runIncrementalSync(googleSvc, chefEventService, logger);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unknown incremental sync error";
    logger.error(
      `[subscriber:google-calendar-incremental-sync] sync failed: ${message}`,
    );

    const connection = await googleSvc.getPrimaryConnection();
    if (connection?.id) {
      await googleSvc.updateGoogleCalendarConnections({
        id: connection.id,
        status: "sync_error",
        lastSyncError: message,
      });
    }
  } finally {
    if (acquired) {
      try {
        await cache.invalidate(LOCK_KEY);
      } catch (releaseError) {
        const message =
          releaseError instanceof Error
            ? releaseError.message
            : "unknown error";
        logger.warn(
          `[subscriber:google-calendar-incremental-sync] lock release failed: ${message}`,
        );
      }
    }
  }
}

export const config: SubscriberConfig = {
  event: "google-calendar.incremental-sync-requested",
};
