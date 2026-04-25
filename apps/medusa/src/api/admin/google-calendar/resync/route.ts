import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http";
import { GOOGLE_CALENDAR_CONNECTION_MODULE } from "../../../../modules/google-calendar-connection";
import type GoogleCalendarConnectionModuleService from "../../../../modules/google-calendar-connection/service";
import { CHEF_EVENT_MODULE } from "../../../../modules/chef-event";
import { runIncrementalSync } from "../../../../lib/google-calendar/incremental-sync";
import { ensureGoogleCalendarWatchAndBootstrapSync } from "../../../../lib/google-calendar/ensure-watch";
import { syncChefEventRecord } from "../../../../lib/google-calendar/events";

export async function POST(
  req: MedusaRequest,
  res: MedusaResponse,
): Promise<void> {
  const syncTriggeredAt = new Date();
  const reconcileUntil = new Date(syncTriggeredAt);
  reconcileUntil.setDate(reconcileUntil.getDate() + 60);

  const svc = req.scope.resolve(
    GOOGLE_CALENDAR_CONNECTION_MODULE,
  ) as GoogleCalendarConnectionModuleService;

  const connection = await svc.getPrimaryConnection();
  if (!connection?.id) {
    res.status(404).json({ message: "Google Calendar is not connected." });
    return;
  }

  await svc.updateGoogleCalendarConnections({
    id: connection.id,
    nextSyncToken: null,
    lastSyncError: null,
    status: "active",
  });

  const logger = req.scope.resolve("logger") as {
    info: (msg: string) => void;
    warn: (msg: string) => void;
  };
  const chefEventService = req.scope.resolve(CHEF_EVENT_MODULE) as any;
  await runIncrementalSync(svc, chefEventService, logger);

  // Reconcile app -> Google after pull sync for events in the active window.
  const chefEvents = (await chefEventService.listChefEvents({
    requestedDate: { $gte: syncTriggeredAt, $lte: reconcileUntil },
  })) as Array<Record<string, unknown>>;
  let reconciled = 0;
  let failed = 0;

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
      await syncChefEventRecord(svc, { chefEvent, operation });
      reconciled += 1;
    } catch (error) {
      failed += 1;
      logger.warn(
        `Google Calendar reconciliation failed for chef event ${chefEventId}: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }
  }

  await ensureGoogleCalendarWatchAndBootstrapSync(req, svc, {
    skipIncrementalSync: true,
  });

  res.status(200).json({
    started: true,
    reconciled,
    failed,
    totalChefEvents: chefEvents.length,
    windowStart: syncTriggeredAt.toISOString(),
    windowEnd: reconcileUntil.toISOString(),
  });
}
