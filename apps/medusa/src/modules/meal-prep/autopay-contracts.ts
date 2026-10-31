import { z } from "zod";
import { BillingError, type PaymentRequest } from "./billing-contracts";

const id = z.string().min(1).max(200);
const base = { subjectId: id, billId: id, idempotencyKey: id };
const exact = {
  ...base,
  expectedVersion: z.number().int().nonnegative(),
  quoteId: id,
};
// Explicit instants only. There is deliberately no date/timezone-to-trigger calculation.
export const approvedTriggerSchema = z
  .object({
    at: z.string().datetime({ offset: true }),
    policyReference: id,
    approvalReference: id,
    fixture: z.literal("test-only-unresolved-D01"),
  })
  .strict();
export const autopayCommandSchema = z.discriminatedUnion("operation", [
  z.object({ ...exact, operation: z.literal("setup_method") }).strict(),
  z
    .object({
      ...exact,
      operation: z.literal("opt_in"),
      setupId: id,
      totalMinor: z.number().int().positive(),
      currency: z.literal("USD"),
      authorization: z.literal("charge_exact_occurrence_once"),
      termsVersion: z.literal("test-occurrence-consent-v1"),
    })
    .strict(),
  z.object({ ...base, operation: z.literal("revoke"), consentId: id }).strict(),
  z
    .object({ ...base, operation: z.literal("invalidate_method"), setupId: id })
    .strict(),
  z
    .object({
      ...exact,
      operation: z.literal("schedule"),
      kind: z.enum(["autopay", "unpaid_reminder"]),
      trigger: approvedTriggerSchema,
    })
    .strict(),
]);
export type AutopayCommand = z.infer<typeof autopayCommandSchema>;
export type SetupRequest = {
  setupId: string;
  accountId: string;
  customerId: string;
  chefId: string;
  idempotencyKey: string;
};
export type SetupObservation = {
  setupId: string;
  accountId: string;
  customerId: string;
  chefId: string;
  provider: string;
  providerCustomerId: string;
  sessionId: string;
  paymentMethodId: string | null;
  setupIntentId: string | null;
  url: string | null;
  state: "pending" | "ready";
  livemode: false;
};
export interface SavedMethodProvider {
  createSetup(request: SetupRequest): Promise<SetupObservation>;
  retrieveSetup(
    request: SetupRequest,
    sessionId: string,
  ): Promise<SetupObservation>;
}
export type AutopayRequest = PaymentRequest & {
  consentId: string;
  provider: string;
  providerCustomerId: string;
  paymentMethodId: string;
};
export type AutopayObservation = AutopayRequest & {
  intentId: string;
  livemode: false;
  state: "processing" | "requires_action" | "failed" | "succeeded" | "canceled";
};
/** Provider attests that this invocation rejected the method before any create request.
 * This says nothing about earlier/concurrent invocations of the same attempt.
 */
export class AutopayPreCreateRejection extends BillingError {
  constructor() {
    super("SAVED_METHOD_INVALID");
  }
}
export interface AutopayProvider {
  create(request: AutopayRequest): Promise<AutopayObservation>;
  retrieve(
    request: AutopayRequest,
    intentId: string,
  ): Promise<AutopayObservation>;
  // Must return canonical terminal cancellation or success; ambiguity keeps fallback blocked.
  cancel(
    request: AutopayRequest,
    intentId: string,
  ): Promise<AutopayObservation>;
  verify(
    raw: Buffer,
    signature: string,
  ): {
    eventId: string;
    accountId: string;
    attemptId: string;
    intentId: string;
  };
}
export function assertAutopayObservation(
  r: AutopayRequest,
  o: AutopayObservation,
) {
  for (const key of Object.keys(r) as (keyof AutopayRequest)[])
    if (r[key] !== o[key]) throw new BillingError("PROVIDER_MISMATCH");
  if (
    o.livemode !== false ||
    !o.intentId ||
    ![
      "processing",
      "requires_action",
      "failed",
      "succeeded",
      "canceled",
    ].includes(o.state)
  )
    throw new BillingError("PROVIDER_MISMATCH");
}
