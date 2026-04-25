import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http";
import { GOOGLE_CALENDAR_CONNECTION_MODULE } from "../../../../modules/google-calendar-connection";
import type GoogleCalendarConnectionModuleService from "../../../../modules/google-calendar-connection/service";
import { CHEF_EVENT_MODULE } from "../../../../modules/chef-event";
import { runIncrementalSync } from "../../../../lib/google-calendar/incremental-sync";
import { ensureGoogleCalendarWatchAndBootstrapSync } from "../../../../lib/google-calendar/ensure-watch";

export async function POST(
  req: MedusaRequest,
  res: MedusaResponse,
): Promise<void> {
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

  const chefEventService = req.scope.resolve(CHEF_EVENT_MODULE) as any;
  await runIncrementalSync(svc, chefEventService);
  await ensureGoogleCalendarWatchAndBootstrapSync(req, svc, {
    skipIncrementalSync: true,
  });

  res.status(200).json({ started: true });
}
