import { z } from "zod";
import { localDateSchema } from "./capture-contracts";
import { recurrenceSchema } from "./recurrence";
const id = z.string().min(1).max(200);
const instant = z.string().datetime({ offset: true });
// Exact review snapshot only. No invented price calculation, policy approval or billing eligibility.
export const quoteReviewSchema = z.discriminatedUnion("status", [
  z.object({ status: z.literal("unknown") }).strict(),
  z
    .object({
      status: z.literal("exact_review"),
      currency: z.string().regex(/^[A-Z]{3}$/),
      totalMinor: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER),
      provenance: z.string().min(1).max(2000),
    })
    .strict(),
]);
export const menuReviewSchema = z
  .object({ selectionRevisionId: id, quote: quoteReviewSchema })
  .strict();
export const changeSchema = z
  .discriminatedUnion("type", [
    z.object({ type: z.literal("menu"), menu: menuReviewSchema }).strict(),
    z.object({ type: z.literal("portions"), menu: menuReviewSchema }).strict(),
    z
      .object({
        type: z.literal("reschedule"),
        localDate: localDateSchema,
        instant,
        reason: z.string().min(1).max(2000),
      })
      .strict(),
    z
      .object({ type: z.literal("skip"), reason: z.string().min(1).max(2000) })
      .strict(),
    z
      .object({
        type: z.literal("pause"),
        from: localDateSchema,
        through: localDateSchema,
        reason: z.string().min(1).max(2000),
      })
      .strict(),
  ])
  .refine((v) => v.type !== "pause" || v.from <= v.through);
const envelope = {
  subjectId: id,
  expectedVersion: z.number().int().nonnegative().max(2147483646),
  idempotencyKey: id,
};
export const approvalCommandSchema = z.discriminatedUnion("operation", [
  z
    .object({
      ...envelope,
      operation: z.literal("propose_arrangement"),
      householdId: id,
      customerId: id,
      method: z.enum(["in_home", "delivery", "pickup"]),
      recurrence: recurrenceSchema,
    })
    .strict(),
  z
    .object({
      ...envelope,
      operation: z.literal("approve_arrangement"),
      revisionId: id,
    })
    .strict(),
  z
    .object({
      ...envelope,
      operation: z.literal("record_candidate"),
      arrangementId: id,
      arrangementRevisionId: id,
      localDate: localDateSchema,
      slotId: id,
    })
    .strict(),
  z
    .object({
      ...envelope,
      operation: z.literal("propose_menu"),
      menu: menuReviewSchema,
    })
    .strict(),
  z
    .object({
      ...envelope,
      operation: z.literal("decide_menu"),
      revisionId: id,
      decision: z.enum(["approved", "rejected"]),
    })
    .strict(),
  z
    .object({
      ...envelope,
      operation: z.literal("request_change"),
      change: changeSchema,
    })
    .strict(),
  z
    .object({
      ...envelope,
      operation: z.literal("decide_change"),
      revisionId: id,
      decision: z.enum(["approved", "rejected"]),
    })
    .strict(),
  z
    .object({
      ...envelope,
      operation: z.literal("link_work"),
      blockId: id,
      expectedBlockVersion: z.number().int().positive(),
      expectedAvailabilityVersion: z.number().int().nonnegative(),
    })
    .strict(),
  z
    .object({
      ...envelope,
      operation: z.literal("set_selection_deadline"),
      deadline: instant,
    })
    .strict(),
  z
    .object({
      ...envelope,
      operation: z.literal("flag_missed_selection"),
      now: instant,
    })
    .strict(),
]);
export type ApprovalCommand = z.infer<typeof approvalCommandSchema>;
export class MealPrepApprovalError extends Error {
  constructor(
    public readonly code:
      | "INVALID_INPUT"
      | "NOT_FOUND"
      | "STALE_VERSION"
      | "IDEMPOTENCY_CONFLICT"
      | "INVALID_STATE"
      | "POLICY_REQUIRED",
    public readonly decisions: string[] = [],
  ) {
    super(code);
  }
}
export type ApprovalState = {
  householdId: string;
  method: "in_home" | "delivery" | "pickup";
  arrangementRevisionId: string;
  arrangementApproved: boolean;
  candidate: import("./recurrence").Candidate | null;
  proposedMenuRevisionId: string | null;
  confirmedMenuRevisionId: string | null;
  pendingChangeRevisionId: string | null;
  selectionDeadline: string | null;
  selectionSubmittedAt: string | null;
  followUp: boolean;
  workBlockIds: string[];
};
