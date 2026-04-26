import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http";
import { MedusaError } from "@medusajs/framework/utils";
import { z } from "zod";
import { GOOGLE_CALENDAR_CONNECTION_MODULE } from "../../../../../../modules/google-calendar-connection";
import type GoogleCalendarConnectionModuleService from "../../../../../../modules/google-calendar-connection/service";
import { CHEF_EVENT_MODULE } from "../../../../../../modules/chef-event";
import type ChefEventModuleService from "../../../../../../modules/chef-event/service";
import { syncChefEventRecord } from "../../../../../../lib/google-calendar/events";

const incidentIdSchema = z.string().min(1, "Incident id is required.");

type AuthRequest = MedusaRequest & {
  auth_context?: { actor_id?: string | null };
};

export async function POST(
  req: MedusaRequest,
  res: MedusaResponse,
): Promise<void> {
  const incidentId = incidentIdSchema.parse(req.params.id);

  const svc = req.scope.resolve(
    GOOGLE_CALENDAR_CONNECTION_MODULE,
  ) as GoogleCalendarConnectionModuleService;

  const incident = await svc.getIncidentById(incidentId);
  if (!incident?.id) {
    throw new MedusaError(
      MedusaError.Types.NOT_FOUND,
      `Incident ${incidentId} not found.`,
    );
  }

  const status = String(incident.status || "");
  if (status && status !== "pending") {
    throw new MedusaError(
      MedusaError.Types.NOT_ALLOWED,
      `Incident is already ${status}.`,
    );
  }

  const chefEventId = String(
    incident.chefEventId ?? incident.chef_event_id ?? "",
  );
  if (!chefEventId) {
    throw new MedusaError(
      MedusaError.Types.INVALID_DATA,
      "Incident is missing chef event id.",
    );
  }

  const chefEventService = req.scope.resolve(
    CHEF_EVENT_MODULE,
  ) as ChefEventModuleService;
  const chefEvent = await chefEventService.retrieveChefEvent(chefEventId);
  if (!chefEvent?.id) {
    throw new MedusaError(
      MedusaError.Types.NOT_FOUND,
      `Chef event ${chefEventId} not found.`,
    );
  }

  await syncChefEventRecord(svc, {
    chefEvent: chefEvent as Record<string, unknown>,
    operation: "upsert",
  });

  const resolvedBy =
    ((req as AuthRequest).auth_context?.actor_id ?? "").toString().trim() ||
    "admin";
  await svc.resolveIncident(incidentId, {
    status: "denied",
    resolvedBy,
  });

  res.status(200).json({ resolved: true, action: "denied" });
}
