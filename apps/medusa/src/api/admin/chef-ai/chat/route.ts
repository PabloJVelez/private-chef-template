import {
  assistantRead,
  basicReadIntent,
  summarySelectionInput,
} from "../../../../lib/chef-ai/assistant-read";
import { MissingBusinessTimezone } from "../../../../lib/chef-ai/chat";
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
import {
  attachEditContext,
  resolveEditProposal,
} from "../../../../lib/chef-ai/edit-proposal";
import {
  answerSchedule,
  chatInput,
  proposalSelectionInput,
} from "../../../../lib/chef-ai/chat";
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
  const parsed = chatInput
    .or(proposalSelectionInput)
    .or(summarySelectionInput)
    .safeParse(req.body);
  if (!parsed.success)
    return fail(
      400,
      "Send a question of 1–1000 characters with at most four previous questions.",
    );
  const release = take(req.auth_context.actor_id);
  if (!release)
    return fail(
      429,
      "Schedule chat has reached its request limit. Please try again later.",
    );
  try {
    if ("summarySelection" in parsed.data)
      return res.json(
        await assistantRead(
          req.scope,
          "context_event",
          {},
          parsed.data.summarySelection.eventId,
        ),
      );
    const input = parsed.data;
    if ("message" in input) {
      const basic = basicReadIntent(input.message);
      if (basic) return res.json(await assistantRead(req.scope, basic, input));
    }
    if (
      "message" in input &&
      ((process.env.CHEF_AI_PROVIDER || "openai") !== "openai" ||
        !process.env.CHEF_AI_OPENAI_API_KEY)
    )
      return fail(
        503,
        "Schedule chat is not configured yet. The site operator must configure the model provider.",
      );
    const settings = await req.scope
      .resolve<AvailabilityModuleService>("availability")
      .listAvailabilitySettings(
        { id: "chef-default" },
        { select: ["id", "timezone"], take: 2 },
      );
    const configured = settings.length === 1 ? settings[0].timezone : undefined;
    const zone = validTimeZone(configured) ? configured : "";
    if ("selection" in input && !zone) throw new MissingBusinessTimezone();
    const answer =
      "selection" in input
        ? await resolveEditProposal(
            req.scope,
            input.selection.intent,
            input.selection.context,
            zone,
            new Date(Date.now()),
            true,
            undefined,
            input.page,
          )
        : await answerSchedule(
            input,
            zone,
            selectSchedule,
            (range) => readCalendar(req.scope, range),
            new Date(Date.now()),
            (intent, context) =>
              resolveEditProposal(
                req.scope,
                intent,
                context,
                zone,
                new Date(Date.now()),
                false,
                undefined,
                input.page,
              ),
            (kind) => assistantRead(req.scope, kind, input),
          );
    res.json(await attachEditContext(req.scope, answer));
  } catch (error) {
    if (error instanceof MissingBusinessTimezone)
      return fail(
        422,
        "Set a valid business timezone in Settings → Availability before asking schedule questions.",
      );
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
