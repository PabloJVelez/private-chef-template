import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http";
import { GOOGLE_CALENDAR_CONNECTION_MODULE } from "../../../../../../modules/google-calendar-connection";
import type GoogleCalendarConnectionModuleService from "../../../../../../modules/google-calendar-connection/service";
import { CHEF_EVENT_MODULE } from "../../../../../../modules/chef-event";
import { syncChefEventRecord } from "../../../../../../lib/google-calendar/events";

export async function POST(
  req: MedusaRequest,
  res: MedusaResponse,
): Promise<void> {
  const svc = req.scope.resolve(
    GOOGLE_CALENDAR_CONNECTION_MODULE,
  ) as GoogleCalendarConnectionModuleService;
  const incidentId = String(req.params.id || "");
  if (!incidentId) {
    res.status(400).json({ message: "Incident id is required." });
    return;
  }

  const incident = await svc.getIncidentById(incidentId);
  if (!incident?.id) {
    res.status(404).json({ message: "Incident not found." });
    return;
  }

  const status = String(incident.status || "");
  if (status && status !== "pending") {
    res.status(409).json({ message: `Incident is already ${status}.` });
    return;
  }

  const chefEventId = String(
    incident.chefEventId ?? incident.chef_event_id ?? "",
  );
  if (!chefEventId) {
    res.status(400).json({ message: "Incident is missing chef event id." });
    return;
  }

  const chefEventService = req.scope.resolve(CHEF_EVENT_MODULE) as any;
  const chefEvent = await chefEventService.retrieveChefEvent(chefEventId);
  if (!chefEvent?.id) {
    res.status(404).json({ message: "Chef event not found." });
    return;
  }

  await syncChefEventRecord(svc, {
    chefEvent: chefEvent as Record<string, unknown>,
    operation: "upsert",
  });

  const resolvedBy =
    String((req as any).auth_context?.actor_id || "").trim() || "admin";
  await svc.resolveIncident(incidentId, {
    status: "denied",
    resolvedBy,
  });

  res.status(200).json({ resolved: true, action: "denied" });
}
