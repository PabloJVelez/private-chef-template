import { z } from "@medusajs/framework/zod";

export const MAX_EDIT_CANDIDATES = 20;
const candidate = z
  .object({
    id: z
      .string()
      .min(1)
      .max(200)
      .regex(/^[a-zA-Z0-9_-]+$/),
    revision: z.string().regex(/^[a-f0-9]{32}$/),
  })
  .strict();
/** Application-owned, untrusted hints. Never passed to the model or used as authorization. */
export const editContextSchema = z
  .object({
    candidates: z.array(candidate).min(1).max(MAX_EDIT_CANDIDATES),
    selectedId: candidate.shape.id.optional(),
    observedAt: z.number().int().positive(),
  })
  .strict()
  .refine(
    (value) =>
      new Set(value.candidates.map((c) => c.id)).size ===
        value.candidates.length &&
      (!value.selectedId ||
        value.candidates.some((c) => c.id === value.selectedId)),
    "Invalid event selection.",
  );
const dateExpression = z.discriminatedUnion("kind", [
  z
    .object({
      kind: z.literal("iso"),
      value: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    })
    .strict(),
  z
    .object({
      kind: z.literal("day_of_month"),
      day: z.number().int().min(1).max(31),
    })
    .strict(),
  z
    .object({
      kind: z.literal("relative_day"),
      offset: z.number().int().min(-31).max(31),
    })
    .strict(),
  z
    .object({
      kind: z.literal("month_day"),
      month: z.number().int().min(1).max(12),
      day: z.number().int().min(1).max(31),
      year: z.number().int().min(1900).max(2200).nullable(),
    })
    .strict(),
]);
export const editIntentSchema = z
  .object({
    target: z.enum(["context", "clarify"]),
    date: dateExpression.nullable(),
    time: z
      .string()
      .regex(/^([01]\d|2[0-3]):[0-5]\d$/)
      .nullable(),
    clarification: z.enum(["none", "date", "time", "target"]),
  })
  .strict()
  .refine(
    (i) => i.date !== null || i.time !== null || i.clarification !== "none",
    "An edit needs a proposed date or time.",
  );
export type EditIntent = z.infer<typeof editIntentSchema>;
export type EditContext = z.infer<typeof editContextSchema>;
export type EditProposal = {
  eventId: string;
  expectedRevision: string;
  date?: string;
  time?: string;
};

/** JSON schema is separate from event context; exactly this non-executable vocabulary is exposed. */
export function editIntentTool() {
  const object = (properties: Record<string, unknown>) => ({
    type: "object" as const,
    properties,
    required: Object.keys(properties),
    additionalProperties: false,
  });
  return {
    type: "function" as const,
    function: {
      name: "propose_pending_event_date_time_edit",
      description:
        "Propose only a pending event date and/or local arrival time. Never executes an edit. No IDs or selection by names. Use context for anaphoric/selected event; otherwise clarify target. Preserve date expression semantics; never decide availability or suggest an alternate date.",
      strict: true,
      parameters: object({
        target: { type: "string", enum: ["context", "clarify"] },
        date: {
          anyOf: [
            object({
              kind: { type: "string", enum: ["iso"] },
              value: {
                type: "string",
                description: "Explicit full YYYY-MM-DD only.",
              },
            }),
            object({
              kind: { type: "string", enum: ["day_of_month"] },
              day: {
                type: "integer",
                description:
                  "Bare ordinal such as the 29th. Do not infer month/year.",
              },
            }),
            object({
              kind: { type: "string", enum: ["relative_day"] },
              offset: {
                type: "integer",
                description:
                  "Calendar days relative to business-local TODAY, e.g. tomorrow=1. Never relative to event date.",
              },
            }),
            object({
              kind: { type: "string", enum: ["month_day"] },
              month: { type: "integer" },
              day: { type: "integer" },
              year: {
                type: ["integer", "null"],
                description:
                  "Explicit year if supplied, otherwise null. Do not invent a year.",
              },
            }),
            { type: "null" },
          ],
        },
        time: {
          type: ["string", "null"],
          description:
            "Unambiguous local HH:mm only. For at 7 without AM/PM use null and clarification=time. Null when not requested.",
        },
        clarification: {
          type: "string",
          enum: ["none", "date", "time", "target"],
        },
      }),
    },
  };
}
