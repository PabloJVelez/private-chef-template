import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http";
import { GOOGLE_CALENDAR_CONNECTION_MODULE } from "../../../modules/google-calendar-connection";
import type GoogleCalendarConnectionModuleService from "../../../modules/google-calendar-connection/service";
import { CHEF_EVENT_MODULE } from "../../../modules/chef-event";
import { runIncrementalSync } from "../../../lib/google-calendar/incremental-sync";

export async function POST(
  req: MedusaRequest,
  res: MedusaResponse,
): Promise<void> {
  const channelId = String(req.headers["x-goog-channel-id"] || "");
  const resourceState = String(req.headers["x-goog-resource-state"] || "");
  const channelToken = String(req.headers["x-goog-channel-token"] || "");
  const resourceId = String(req.headers["x-goog-resource-id"] || "");
  const channelExpiration = String(req.headers["x-goog-channel-expiration"] || "");

  const svc = req.scope.resolve(
    GOOGLE_CALENDAR_CONNECTION_MODULE,
  ) as GoogleCalendarConnectionModuleService;
  const connection = await svc.getPrimaryConnection();
  const logger = req.scope.resolve("logger") as {
    info: (msg: string) => void;
    error: (msg: string) => void;
  };

  if (!connection?.id) {
    res.status(204).end();
    return;
  }

  const signingSecret = process.env.GOOGLE_CALENDAR_SIGNING_SECRET;
  if (signingSecret && channelToken && channelToken !== signingSecret) {
    res.status(401).json({ message: "Invalid Google channel token" });
    return;
  }

  if (
    connection.watchChannelId &&
    connection.watchChannelId !== channelId &&
    resourceState !== "sync"
  ) {
    await svc.updateGoogleCalendarConnections({
      id: connection.id,
      watchChannelId: channelId || connection.watchChannelId,
      watchResourceId: resourceId || connection.watchResourceId,
      watchExpiresAt: channelExpiration
        ? new Date(Number(channelExpiration))
        : connection.watchExpiresAt,
    });
  } else if (!connection.watchChannelId && channelId) {
    await svc.updateGoogleCalendarConnections({
      id: connection.id,
      watchChannelId: channelId,
      watchResourceId: resourceId || connection.watchResourceId,
      watchExpiresAt: channelExpiration
        ? new Date(Number(channelExpiration))
        : connection.watchExpiresAt,
    });
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
    const chefEventService = req.scope.resolve(CHEF_EVENT_MODULE) as any;
    await runIncrementalSync(svc, chefEventService);
    logger.info(`Google webhook processed successfully (state=${resourceState})`);
    res.status(202).json({
      received: true,
      resourceState,
      processed: true,
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unknown Google webhook error";
    logger.error(`Google webhook processing failed: ${message}`);
    res.status(500).json({
      received: true,
      processed: false,
      error: message,
    });
  }
}
