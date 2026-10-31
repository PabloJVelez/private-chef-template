import { z } from "zod";

const id = z.string().min(1).max(200);
export const fulfillmentFixture = "test-only-unresolved-D02-D03-D08" as const;
const envelope = {
  subjectId: id,
  expectedVersion: z.number().int().nonnegative().max(2147483646),
  idempotencyKey: id,
};
// References only: private address/access data stays in the approved intake.
export const fulfillmentDetailsSchema = z.discriminatedUnion("method", [
  z.object({ method: z.literal("in_home"), intakeRevisionId: id }).strict(),
  z.object({ method: z.literal("delivery"), intakeRevisionId: id }).strict(),
  z.object({ method: z.literal("pickup"), locationReference: id }).strict(),
]);
export const fulfillmentCommandSchema = z.discriminatedUnion("operation", [
  z
    .object({
      ...envelope,
      operation: z.literal("plan"),
      policyFixture: z.literal(fulfillmentFixture),
      details: fulfillmentDetailsSchema,
    })
    .strict(),
  z
    .object({
      ...envelope,
      operation: z.literal("progress"),
      planId: id,
      status: z.enum([
        "in_progress",
        "completed",
        "preparing",
        "ready",
        "dispatched",
        "delivered",
        "collected",
      ]),
    })
    .strict(),
  z
    .object({
      ...envelope,
      operation: z.literal("flag_follow_up"),
      reason: z.enum(["operational_review", "handoff_issue"]),
    })
    .strict(),
  z
    .object({
      ...envelope,
      operation: z.literal("resolve_follow_up"),
      flagId: id,
    })
    .strict(),
]);
export type FulfillmentCommand = z.infer<typeof fulfillmentCommandSchema>;
export const fulfillmentPaths = Object.freeze({
  in_home: ["planned", "in_progress", "completed"],
  delivery: ["planned", "preparing", "ready", "dispatched", "delivered"],
  pickup: ["planned", "preparing", "ready", "collected"],
});
export class FulfillmentError extends Error {
  constructor(public readonly code: string) {
    super(code);
  }
}
export function requireFulfillmentTestMode() {
  if (process.env.NODE_ENV !== "test")
    throw new FulfillmentError("FULFILLMENT_DISABLED_D02_D03_D08");
}
export const operationsQuerySchema = z
  .object({
    // Explicit bounded scope; no implicit recurrence horizon or public queue.
    subjectIds: z
      .array(id)
      .min(1)
      .max(100)
      .refine((ids) => new Set(ids).size === ids.length),
  })
  .strict();
