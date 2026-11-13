import type {
  AuthenticatedMedusaRequest,
  MedusaResponse,
} from "@medusajs/framework/http";
import { Modules } from "@medusajs/framework/utils";
import type { IUserModuleService } from "@medusajs/framework/types";
import type AvailabilityModuleService from "../../../../modules/availability/service";
import { readCalendar } from "../../../../lib/chef-workspace/read";
import {
  authorizedSiteAdmin,
  requireSingleStore,
  createChatLimiter,
} from "../../../../lib/chef-ai/access";
import { answerSchedule, chatInput } from "../../../../lib/chef-ai/chat";
import { selectSchedule } from "../../../../lib/chef-ai/provider";
import { validTimeZone } from "../../../../lib/chef-ai/schedule";

const take = createChatLimiter();

export async function POST(
  req: AuthenticatedMedusaRequest,
  res: MedusaResponse,
) {
  res.setHeader("Cache-Control", "no-store");
  const fail = (status: number, message: string) =>
    res.status(status).json({ message });
  if (!authorizedSiteAdmin(req.auth_context))
    return fail(
      403,
      "Schedule chat is unavailable. Ask the site operator to check single-store configuration.",
    );
  // Check the current user still exists; signed tokens alone may outlive deletion.
  try {
    await requireSingleStore(req.scope);
    await req.scope
      .resolve<IUserModuleService>(Modules.USER)
      .retrieveUser(req.auth_context.actor_id);
  } catch {
    return fail(403, "Schedule chat access could not be verified.");
  }
  const parsed = chatInput.safeParse(req.body);
  if (!parsed.success)
    return fail(
      400,
      "Send a question of 1–1000 characters with at most four previous questions.",
    );
  if (
    (process.env.CHEF_AI_PROVIDER || "openai") !== "openai" ||
    !process.env.CHEF_AI_OPENAI_API_KEY
  )
    return fail(
      503,
      "Schedule chat is not configured yet. The site operator must configure the model provider.",
    );
  const release = take(req.auth_context.actor_id);
  if (!release)
    return fail(
      429,
      "Schedule chat has reached its request limit. Please try again later.",
    );
  try {
    const settings = await req.scope
      .resolve<AvailabilityModuleService>("availability")
      .listAvailabilitySettings(
        { id: "chef-default" },
        { select: ["id", "timezone"], take: 2 },
      );
    const zone = settings.length === 1 ? settings[0].timezone : undefined;
    if (!validTimeZone(zone))
      return fail(
        422,
        "Set a valid business timezone in Settings → Availability before asking schedule questions.",
      );
    res.json(
      await answerSchedule(parsed.data, zone, selectSchedule, (range) =>
        readCalendar(req.scope, range),
      ),
    );
  } catch {
    // Do not log provider exceptions, prompts, request bodies or customer data.
    // Catch here so the generic Sentry error handler cannot attach chat contents.
    return fail(
      502,
      "Schedule chat could not complete the read. Schedule information is missing; please retry or open the calendar.",
    );
  } finally {
    release();
  }
}
