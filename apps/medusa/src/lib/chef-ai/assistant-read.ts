import { z } from "@medusajs/framework/zod";
import type { MedusaContainer } from "@medusajs/framework/types";
import type ChefEventModuleService from "../../modules/chef-event/service";
import { CHEF_EVENT_MODULE } from "../../modules/chef-event";
import {
  summaryFields,
  privateEventSummary,
} from "../chef-workspace/private-event";
import type { RequestSummary } from "../chef-workspace/contracts";
import { validTimeZone } from "./schedule";
import type { ChatInput, ScheduleAnswer } from "./contracts";

export const assistantReadSchema = z
  .object({ kind: z.enum(["greeting", "help", "page_event", "context_event"]) })
  .strict();
export type AssistantRead = z.infer<typeof assistantReadSchema>["kind"];
export const assistantReadTool = {
  type: "function" as const,
  function: {
    name: "assistant_read",
    strict: true,
    description:
      "Non-effectful greeting, capability help, or read-only summary. page_event means explicitly THIS page/event; context_event means ambiguous it. Never includes IDs or executes edits.",
    parameters: {
      type: "object",
      additionalProperties: false,
      properties: {
        kind: {
          type: "string",
          enum: ["greeting", "help", "page_event", "context_event"],
        },
      },
      required: ["kind"],
    },
  },
};
/** Whole-message shortcuts only: a greeting prefix must never swallow an edit. */
export function basicReadIntent(message: string): AssistantRead | undefined {
  const text = message
    .trim()
    .toLowerCase()
    .replace(/[’]/g, "'")
    .replace(/[.!?]+$/, "")
    .trim();
  if (
    /^(hello|hi|hey|hey chef|hello sous chef|hi sous chef|good morning|good afternoon|good evening)$/.test(
      text,
    )
  )
    return "greeting";
  if (
    /^(help|what can you (help me with|do)|how can you help( me)?|what do you do)$/.test(
      text,
    )
  )
    return "help";
  if (
    /^(what('s| is) this event about|tell me about (this|the current|the open) event|summarize this event|show me this event)$/.test(
      text,
    )
  )
    return "page_event";
  return undefined;
}
const answer = (message: string): ScheduleAnswer => ({
  presentation: "answer",
  message,
  entries: [],
});
export async function assistantRead(
  scope: MedusaContainer,
  kind: AssistantRead,
  input: Pick<ChatInput, "page" | "context">,
  explicitId?: string,
): Promise<ScheduleAnswer> {
  if (kind === "greeting") return answer("Hey Chef! What can I help you with?");
  if (kind === "help")
    return answer(
      "I can show your schedule, explain the event open on this page, and help change a pending event’s date or time. You review the change and use Confirm change to save it.",
    );
  const chef = scope.resolve<ChefEventModuleService>(CHEF_EVENT_MODULE);
  const read = async (id: string) => {
    // Narrow Medusa read; no contact/address/notes/payment data is loaded or returned.
    const event = await chef.retrieveChefEvent(id, {
      select: [...summaryFields, "partySize"],
    });
    if (
      event.id !== id ||
      !["pending", "confirmed", "cancelled", "completed"].includes(event.status)
    )
      throw new Error("Unavailable");
    const summary = privateEventSummary(event);
    return {
      ...summary,
      title: summary.title.slice(0, 160),
      category: summary.category.slice(0, 100),
      // Never substitute the browser zone or an availability setting for a missing saved zone.
      ...(!validTimeZone(event.timeZone)
        ? {
            requestedTime: null,
            appointmentTime: null,
            timeZone: "UTC",
            timingUnavailable: true,
          }
        : {}),
      ...(Number.isInteger(event.partySize) && event.partySize > 0
        ? { guestCount: event.partySize }
        : {}),
    };
  };
  const pageId =
    input.page?.surface === "chef-events" ? input.page.resource.id : undefined;
  if (!explicitId && kind === "page_event" && !pageId)
    return answer(
      "Open a Private Event to ask about its details. I can still help with your schedule here.",
    );
  try {
    // Validate the page first; never fall back to another event when it is unavailable.
    const opened = pageId ? await read(pageId) : undefined;
    let ids = explicitId ? [explicitId] : pageId ? [pageId] : [];
    if (
      !explicitId &&
      kind === "context_event" &&
      input.context &&
      Date.now() - input.context.observedAt <= 300_000 &&
      input.context.observedAt <= Date.now() + 5000
    ) {
      ids = [
        ...new Set([...ids, ...input.context.candidates.map((c) => c.id)]),
      ];
    }
    if (!ids.length)
      return answer("Which event? Open its page and ask me about it.");
    const summaries = await Promise.all(
      ids.map((id) => (opened?.source.id === id ? opened : read(id))),
    );
    if (summaries.length > 1)
      return {
        ...answer(
          "The event open on this page, or the event we just discussed?",
        ),
        presentation: "clarification",
        summaryChoices: summaries,
      };
    const summary = summaries[0];
    const result: ScheduleAnswer = {
      ...answer("Here is the recorded event."),
      summary,
    };
    // Read facts may establish fresh conversation focus, but never from visible
    // history alone. Compare the projected read with the current domain revision.
    try {
      const current = await chef.readScheduleEditEvent(summary.source.id);
      if (
        current.id === summary.source.id &&
        current.status === summary.status &&
        current.title === summary.title &&
        current.timeZone === summary.timeZone &&
        new Date(current.requestedDate).toISOString() ===
          summary.requestedTime?.start
      ) {
        result.complete = true;
        result.editContext = {
          candidates: [{ id: current.id, revision: current.revision }],
          observedAt: Date.now(),
        };
      }
    } catch {
      /* The summary remains readable without an actionable edit context. */
    }
    return result;
  } catch {
    return answer(
      "I can’t read that event right now. It may have changed or been removed. Open or refresh its page to check.",
    );
  }
}
export type EventSummary = RequestSummary & {
  guestCount?: number;
  timingUnavailable?: boolean;
};
export const summarySelectionInput = z
  .object({
    summarySelection: z
      .object({
        eventId: z
          .string()
          .min(1)
          .max(200)
          .regex(/^[a-zA-Z0-9_-]+$/),
      })
      .strict(),
  })
  .strict();
