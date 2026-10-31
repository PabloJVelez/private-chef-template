import Stripe from "stripe";
import {
  BillingError,
  requireBillingTestMode,
  assertObservation,
  type ManualPaymentProvider,
  type PaymentRequest,
  type PaymentObservation,
} from "./billing-contracts";

/** Dedicated Connect direct-charge test adapter; never uses legacy fee classifiers.
 * Test fixture totals have no inferred taxes, commissions, grocery or split amounts.
 * This is not registered as a production Medusa payment provider. */
export class StripeTestManualProvider implements ManualPaymentProvider {
  private stripe: Stripe;
  constructor(
    private options: {
      apiKey: string;
      webhookSecret: string;
      successUrl: string;
      cancelUrl: string;
    },
  ) {
    requireBillingTestMode();
    if (
      !/^sk_test_/.test(options.apiKey) ||
      !/^whsec_/.test(options.webhookSecret)
    )
      throw new BillingError("TEST_CREDENTIALS_REQUIRED");
    for (const value of [options.successUrl, options.cancelUrl]) {
      const url = new URL(value);
      if (
        !["localhost", "127.0.0.1", "example.invalid"].includes(url.hostname) ||
        !["http:", "https:"].includes(url.protocol) ||
        url.username ||
        url.password
      )
        throw new BillingError("TEST_RETURN_URL_REQUIRED");
    }
    // Do not let an ambiguous SDK transport retry become an application-level new attempt.
    this.stripe = new Stripe(options.apiKey, {
      maxNetworkRetries: 0,
      timeout: 10000,
    });
  }
  private metadata(r: PaymentRequest) {
    return {
      attemptId: r.attemptId,
      billId: r.billId,
      quoteId: r.quoteId,
      idempotencyKey: r.idempotencyKey,
    };
  }
  async create(r: PaymentRequest) {
    requireBillingTestMode();
    const session = await this.stripe.checkout.sessions.create(
      {
        mode: "payment",
        payment_method_types: ["card"],
        client_reference_id: r.attemptId,
        metadata: this.metadata(r),
        payment_intent_data: { metadata: this.metadata(r) },
        line_items: [
          {
            quantity: 1,
            price_data: {
              currency: r.currency.toLowerCase(),
              unit_amount: r.totalMinor,
              product_data: { name: "Meal prep approved occurrence (test)" },
            },
          },
        ],
        success_url: this.options.successUrl,
        cancel_url: this.options.cancelUrl,
      },
      { stripeAccount: r.accountId, idempotencyKey: r.idempotencyKey },
    );
    // Read canonical current data, including the PaymentIntent if one exists.
    return this.retrieve(r, session.id);
  }
  async retrieve(
    r: PaymentRequest,
    sessionId: string,
  ): Promise<PaymentObservation> {
    requireBillingTestMode();
    if (!/^cs_test_/.test(sessionId))
      throw new BillingError("TEST_SESSION_REQUIRED");
    const session = await this.stripe.checkout.sessions.retrieve(
      sessionId,
      { expand: ["payment_intent"] },
      { stripeAccount: r.accountId },
    );
    if (
      session.id !== sessionId ||
      session.livemode ||
      session.mode !== "payment" ||
      session.client_reference_id !== r.attemptId ||
      session.amount_total !== r.totalMinor ||
      session.currency !== r.currency.toLowerCase()
    )
      throw new BillingError("PROVIDER_MISMATCH");
    for (const [key, value] of Object.entries(this.metadata(r)))
      if (session.metadata?.[key] !== value)
        throw new BillingError("PROVIDER_MISMATCH");
    const intent = session.payment_intent;
    if (typeof intent === "string")
      throw new BillingError("PAYMENT_INTENT_NOT_EXPANDED");
    if (intent) {
      if (
        intent.livemode ||
        intent.amount !== r.totalMinor ||
        intent.currency !== r.currency.toLowerCase()
      )
        throw new BillingError("PROVIDER_MISMATCH");
      for (const [key, value] of Object.entries(this.metadata(r)))
        if (intent.metadata?.[key] !== value)
          throw new BillingError("PROVIDER_MISMATCH");
    }
    let state: PaymentObservation["state"] = "processing";
    if (intent?.status === "succeeded") {
      if (
        intent.amount_received !== r.totalMinor ||
        session.payment_status !== "paid" ||
        session.status !== "complete"
      )
        throw new BillingError("PROVIDER_MISMATCH");
      state = "succeeded";
    } else if (session.status === "expired") state = "expired";
    else if (intent?.status === "requires_action") state = "requires_action";
    else if (
      intent?.status === "requires_payment_method" &&
      intent.last_payment_error
    )
      state = "failed";
    else if (session.status === "open") state = "open";
    const result: PaymentObservation = {
      ...r,
      sessionId: session.id,
      intentId: intent?.id ?? null,
      url: session.url,
      expiresAt: session.expires_at,
      livemode: false,
      state,
    };
    assertObservation(r, result);
    return result;
  }
  verify(raw: Buffer, signature: string) {
    requireBillingTestMode();
    // Stripe validates signature and timestamp tolerance over the untouched bytes.
    let event: Stripe.Event;
    try {
      event = this.stripe.webhooks.constructEvent(
        raw,
        signature,
        this.options.webhookSecret,
        300,
      );
    } catch {
      throw new BillingError("INVALID_WEBHOOK");
    }
    if (
      event.livemode ||
      !event.account ||
      !/^evt_/.test(event.id) ||
      ![
        "checkout.session.completed",
        "checkout.session.expired",
        "checkout.session.async_payment_succeeded",
        "checkout.session.async_payment_failed",
      ].includes(event.type)
    )
      throw new BillingError("UNSUPPORTED_WEBHOOK");
    const session = event.data.object as Stripe.Checkout.Session;
    if (
      session.object !== "checkout.session" ||
      session.livemode ||
      !/^cs_test_/.test(session.id) ||
      !session.metadata?.attemptId
    )
      throw new BillingError("INVALID_WEBHOOK");
    return {
      eventId: event.id,
      accountId: event.account,
      sessionId: session.id,
      attemptId: session.metadata.attemptId,
    };
  }
}
