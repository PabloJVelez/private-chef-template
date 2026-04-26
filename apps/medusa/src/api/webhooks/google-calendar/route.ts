import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http";
import {
  ContainerRegistrationKeys,
  Modules,
} from "@medusajs/framework/utils";
import { GOOGLE_CALENDAR_CONNECTION_MODULE } from "../../../modules/google-calendar-connection";
import type GoogleCalendarConnectionModuleService from "../../../modules/google-calendar-connection/service";

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
 * Google Calendar push notification endpoint.
 *
 * We acknowledge with 202 as soon as the channel/identity checks pass and
 * dispatch the actual incremental sync via the event bus. This avoids
 * blocking Google's retry budget on slow API calls and lets the subscriber
 * coalesce overlapping pushes.
 */
export async function POST(
  req: MedusaRequest,
  res: MedusaResponse,
): Promise<void> {
  const channelId = String(req.headers["x-goog-channel-id"] || "");
  const resourceState = String(req.headers["x-goog-resource-state"] || "");
  const channelToken = String(req.headers["x-goog-channel-token"] || "");
  const resourceId = String(req.headers["x-goog-resource-id"] || "");

  const svc = req.scope.resolve(
    GOOGLE_CALENDAR_CONNECTION_MODULE,
  ) as GoogleCalendarConnectionModuleService;
  const connection = await svc.getPrimaryConnection();
  const logger = req.scope.resolve(ContainerRegistrationKeys.LOGGER) as Logger;

  if (!connection?.id) {
    res.status(204).end();
    return;
  }

  const expectedToken = svc.getConfig().channelToken;
  if (expectedToken && channelToken && channelToken !== expectedToken) {
    res.status(401).json({ message: "Invalid Google channel token" });
    return;
  }

  // Watch lifecycle (channelId/resourceId/expiresAt) is owned by
  // `ensureGoogleCalendarWatchAndBootstrapSync` (called from connect, resync,
  // and the scheduled renewal job). The webhook stays a thin auth + dispatch
  // handler so it doesn't mutate channel state from header strings whose
  // format can drift (e.g. RFC date vs. epoch ms).
  if (
    connection.watchChannelId &&
    channelId &&
    connection.watchChannelId !== channelId &&
    resourceState !== "sync"
  ) {
    logger.warn(
      `Google webhook received unexpected channel id "${channelId}" (expected "${connection.watchChannelId}"); ignoring channel metadata. Renewal job will reconcile.`,
    );
  }

  await svc.updateGoogleCalendarConnections({
    id: connection.id,
    lastSyncedAt: new Date(),
    status: "active",
    lastSyncError: null,
  });

  if (resourceState === "sync") {
    res.status(202).json({
      received: true,
      resourceState,
      bootstrap: true,
    });
    return;
  }

  try {
    const eventBus = req.scope.resolve(Modules.EVENT_BUS) as EventBusService;
    await eventBus.emit({
      name: "google-calendar.incremental-sync-requested",
      data: {
        channelId,
        resourceId,
        resourceState,
        receivedAt: new Date().toISOString(),
      },
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unknown event bus emit error";
    logger.error(
      `Google webhook failed to enqueue incremental sync: ${message}`,
    );
    res.status(500).json({ received: false, error: message });
    return;
  }

  res.status(202).json({
    received: true,
    resourceState,
    enqueued: true,
  });
}
