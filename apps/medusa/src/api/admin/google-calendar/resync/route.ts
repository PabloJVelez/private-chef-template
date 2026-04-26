import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http";
import {
  ContainerRegistrationKeys,
  MedusaError,
  Modules,
} from "@medusajs/framework/utils";
import { GOOGLE_CALENDAR_CONNECTION_MODULE } from "../../../../modules/google-calendar-connection";
import type GoogleCalendarConnectionModuleService from "../../../../modules/google-calendar-connection/service";
import { CHEF_EVENT_MODULE } from "../../../../modules/chef-event";
import type ChefEventModuleService from "../../../../modules/chef-event/service";
import { ensureGoogleCalendarWatchAndBootstrapSync } from "../../../../lib/google-calendar/ensure-watch";

const RECONCILE_WINDOW_DAYS = 60;

type EventBusService = {
  emit: (
    message: { name: string; data: Record<string, unknown> },
  ) => Promise<void>;
};

type Logger = {
  info: (msg: string) => void;
  warn: (msg: string) => void;
  error: (msg: string) => void;
};

/**
 * Manual resync trigger from the admin UI.
 *
 * Workflow:
 * 1. Reset the sync token + ensure the watch is fresh (re-arms push channel).
 * 2. Enqueue a Google -> app pull sync via the incremental-sync subscriber.
 * 3. Enqueue per-chef-event app -> Google upsert/cancel events for the
 *    upcoming 60-day window so events missing or stale on Google are
 *    reconciled. The sync work happens out-of-band on the event bus, so we
 *    return immediately with the count of scheduled jobs.
 */
export async function POST(
  req: MedusaRequest,
  res: MedusaResponse,
): Promise<void> {
  const syncTriggeredAt = new Date();
  const reconcileUntil = new Date(syncTriggeredAt);
  reconcileUntil.setDate(reconcileUntil.getDate() + RECONCILE_WINDOW_DAYS);

  const svc = req.scope.resolve(
    GOOGLE_CALENDAR_CONNECTION_MODULE,
  ) as GoogleCalendarConnectionModuleService;

  const connection = await svc.getPrimaryConnection();
  if (!connection?.id) {
    throw new MedusaError(
      MedusaError.Types.NOT_FOUND,
      "Google Calendar is not connected.",
    );
  }

  await svc.updateGoogleCalendarConnections({
    id: connection.id,
    nextSyncToken: null,
    lastSyncError: null,
    status: "active",
  });

  const logger = req.scope.resolve(ContainerRegistrationKeys.LOGGER) as Logger;
  const eventBus = req.scope.resolve(Modules.EVENT_BUS) as EventBusService;
  const chefEventService = req.scope.resolve(
    CHEF_EVENT_MODULE,
  ) as ChefEventModuleService;

  await ensureGoogleCalendarWatchAndBootstrapSync(req.scope, svc, {
    skipIncrementalSync: true,
  });

  await eventBus.emit({
    name: "google-calendar.incremental-sync-requested",
    data: {
      source: "admin-resync",
      triggeredAt: syncTriggeredAt.toISOString(),
    },
  });

  const chefEvents = (await chefEventService.listChefEvents({
    requestedDate: { $gte: syncTriggeredAt, $lte: reconcileUntil },
  })) as Array<{ id?: string; status?: string | null }>;

  let scheduled = 0;
  for (const chefEvent of chefEvents) {
    const chefEventId = String(chefEvent?.id || "");
    if (!chefEventId) {
      continue;
    }

    const operation =
      String(chefEvent.status || "").toLowerCase() === "cancelled"
        ? "cancel"
        : "upsert";

    try {
      await eventBus.emit({
        name: "google-calendar.sync-requested",
        data: {
          chefEventId,
          operation,
          source: "admin-resync",
        },
      });
      scheduled += 1;
    } catch (error) {
      const message =
        error instanceof Error ? error.message : String(error);
      logger.warn(
        `Google Calendar reconciliation enqueue failed for chef event ${chefEventId}: ${message}`,
      );
    }
  }

  res.status(202).json({
    started: true,
    scheduled,
    totalChefEvents: chefEvents.length,
    windowStart: syncTriggeredAt.toISOString(),
    windowEnd: reconcileUntil.toISOString(),
  });
}
