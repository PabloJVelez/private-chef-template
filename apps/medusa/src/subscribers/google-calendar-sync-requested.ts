import type {
  SubscriberArgs,
  SubscriberConfig,
} from "@medusajs/medusa";
import { ContainerRegistrationKeys } from "@medusajs/framework/utils";
import { CHEF_EVENT_MODULE } from "../modules/chef-event";
import { GOOGLE_CALENDAR_CONNECTION_MODULE } from "../modules/google-calendar-connection";
import type GoogleCalendarConnectionModuleService from "../modules/google-calendar-connection/service";
import { syncChefEventRecord } from "../lib/google-calendar/events";

type EventData = {
  chefEventId: string;
  operation?: "upsert" | "cancel";
};

export default async function googleCalendarSyncRequestedHandler({
  event: { data },
  container,
}: SubscriberArgs<EventData>) {
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER);
  const chefEventService = container.resolve(CHEF_EVENT_MODULE) as any;
  const googleSvc = container.resolve(
    GOOGLE_CALENDAR_CONNECTION_MODULE,
  ) as GoogleCalendarConnectionModuleService;

  try {
    if (!data.chefEventId) {
      logger.warn("Google calendar sync skipped: missing chefEventId on event payload");
      return;
    }

    const chefEvent = await chefEventService.retrieveChefEvent(data.chefEventId);
    if (!chefEvent) {
      logger.warn(
        `Google calendar sync skipped: chef event not found (${data.chefEventId})`,
      );
      return;
    }

    const operation =
      data.operation === "cancel" || chefEvent.status === "cancelled"
        ? "cancel"
        : "upsert";

    await syncChefEventRecord(googleSvc, {
      chefEvent: chefEvent as Record<string, unknown>,
      operation,
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unknown Google sync error";
    logger.error(
      `Google calendar sync failed for event ${data.chefEventId}: ${message}`,
    );

    const connection = await googleSvc.getPrimaryConnection();
    if (connection?.id) {
      await googleSvc.updateGoogleCalendarConnections({
        id: connection.id,
        status: "sync_error",
        lastSyncError: message,
      });
    }
  }
}

export const config: SubscriberConfig = {
  event: "google-calendar.sync-requested",
};
