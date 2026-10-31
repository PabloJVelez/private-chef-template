import { z } from "zod";

const id = z.string().min(1).max(200);
// Test fixtures express explicit amounts, never calculate product pricing.
export const billingQuoteSchema = z
  .object({
    subjectId: id,
    expectedVersion: z.number().int().nonnegative(),
    menuRevisionId: id,
    idempotencyKey: id,
    accountId: z.string().regex(/^acct_[a-zA-Z0-9]+$/),
    currency: z.literal("USD"), // Only this exponent is validated in the initial adapter.
    totalMinor: z.number().int().positive().max(99999999),
    components: z
      .array(
        z
          .object({
            kind: z.enum(["cooking", "fulfillment", "grocery", "other"]),
            amountMinor: z.number().int().nonnegative().max(99999999),
            provenance: id,
          })
          .strict(),
      )
      .min(1)
      .max(100),
    policyFixture: z.literal("test-only-unresolved-D04-D05-D10-D11"),
  })
  .strict()
  .refine(
    (q) => q.components.reduce((n, c) => n + c.amountMinor, 0) === q.totalMinor,
    "Components must equal the exact approved amount",
  );
export type BillingQuoteInput = z.infer<typeof billingQuoteSchema>;
export const authorizePaymentSchema = z
  .object({
    subjectId: id,
    billId: id,
    quoteId: id,
    expectedVersion: z.number().int().nonnegative(),
    idempotencyKey: id,
    authorization: z.literal("pay_exact_quote_once"),
  })
  .strict();
export type AuthorizePaymentInput = z.infer<typeof authorizePaymentSchema>;
export class BillingError extends Error {
  constructor(public readonly code: string) {
    super(code);
  }
}
export function requireBillingTestMode() {
  if (process.env.NODE_ENV !== "test")
    throw new BillingError("BILLING_DISABLED_D04_D05_D10_D11");
}
export type PaymentRequest = {
  attemptId: string;
  billId: string;
  quoteId: string;
  accountId: string;
  currency: "USD";
  totalMinor: number;
  idempotencyKey: string;
};
export type PaymentObservation = PaymentRequest & {
  sessionId: string;
  intentId: string | null;
  url: string | null;
  expiresAt: number;
  livemode: false;
  state:
    | "open"
    | "requires_action"
    | "failed"
    | "expired"
    | "succeeded"
    | "processing";
};
export interface ManualPaymentProvider {
  create(request: PaymentRequest): Promise<PaymentObservation>;
  retrieve(
    request: PaymentRequest,
    sessionId: string,
  ): Promise<PaymentObservation>;
  verify(
    raw: Buffer,
    signature: string,
  ): {
    eventId: string;
    accountId: string;
    sessionId: string;
    attemptId: string;
  };
}
export function assertObservation(
  request: PaymentRequest,
  result: PaymentObservation,
) {
  for (const field of [
    "attemptId",
    "billId",
    "quoteId",
    "accountId",
    "currency",
    "totalMinor",
    "idempotencyKey",
  ] as const)
    if (request[field] !== result[field])
      throw new BillingError("PROVIDER_MISMATCH");
  if (
    result.livemode !== false ||
    !/^cs_test_/.test(result.sessionId) ||
    !Number.isSafeInteger(result.expiresAt) ||
    ![
      "open",
      "requires_action",
      "failed",
      "expired",
      "succeeded",
      "processing",
    ].includes(result.state) ||
    (result.state === "succeeded" && !result.intentId)
  )
    throw new BillingError("PROVIDER_MISMATCH");
  if (result.url && !/^https:\/\/checkout\.stripe\.com\//.test(result.url))
    throw new BillingError("UNSAFE_PAYMENT_URL");
}
