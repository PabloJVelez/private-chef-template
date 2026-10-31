import Stripe from "stripe";
import { BillingError, requireBillingTestMode } from "./billing-contracts";
import type {
  AutopayProvider,
  AutopayRequest,
  AutopayObservation,
  SavedMethodProvider,
  SetupRequest,
  SetupObservation,
} from "./autopay-contracts";

/** Isolated Connect test adapter. No native/legacy provider registration or live credentials. */
export class StripeTestAutopayProvider
  implements AutopayProvider, SavedMethodProvider
{
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
      const u = new URL(value);
      if (
        !["localhost", "127.0.0.1", "example.invalid"].includes(u.hostname) ||
        !["http:", "https:"].includes(u.protocol) ||
        u.username ||
        u.password
      )
        throw new BillingError("TEST_RETURN_URL_REQUIRED");
    }
    this.stripe = new Stripe(options.apiKey, {
      maxNetworkRetries: 0,
      timeout: 10000,
    });
  }
  private setupMetadata(r: SetupRequest) {
    return { setupId: r.setupId, customerId: r.customerId, chefId: r.chefId };
  }
  async createSetup(r: SetupRequest): Promise<SetupObservation> {
    requireBillingTestMode();
    const customer = await this.stripe.customers.create(
      { metadata: this.setupMetadata(r) },
      {
        stripeAccount: r.accountId,
        idempotencyKey: `${r.idempotencyKey}:customer`,
      },
    );
    if (customer.livemode) throw new BillingError("PROVIDER_MISMATCH");
    const session = await this.stripe.checkout.sessions.create(
      {
        mode: "setup",
        customer: customer.id,
        payment_method_types: ["card"],
        metadata: this.setupMetadata(r),
        setup_intent_data: { metadata: this.setupMetadata(r) },
        success_url: this.options.successUrl,
        cancel_url: this.options.cancelUrl,
      },
      { stripeAccount: r.accountId, idempotencyKey: r.idempotencyKey },
    );
    return this.retrieveSetup(r, session.id);
  }
  async retrieveSetup(
    r: SetupRequest,
    sessionId: string,
  ): Promise<SetupObservation> {
    requireBillingTestMode();
    if (!/^cs_test_/.test(sessionId))
      throw new BillingError("TEST_SESSION_REQUIRED");
    const s = await this.stripe.checkout.sessions.retrieve(
      sessionId,
      { expand: ["setup_intent", "customer"] },
      { stripeAccount: r.accountId },
    );
    const c = s.customer;
    if (
      s.id !== sessionId ||
      s.livemode ||
      s.mode !== "setup" ||
      !c ||
      typeof c === "string" ||
      c.deleted ||
      c.livemode
    )
      throw new BillingError("SETUP_MISMATCH");
    for (const [k, v] of Object.entries(this.setupMetadata(r)))
      if (s.metadata?.[k] !== v || c.metadata[k] !== v)
        throw new BillingError("SETUP_MISMATCH");
    const si = s.setup_intent;
    if (typeof si === "string") throw new BillingError("SETUP_MISMATCH");
    if (si) {
      if (si.livemode || si.customer !== c.id || si.usage !== "off_session")
        throw new BillingError("SETUP_MISMATCH");
      for (const [k, v] of Object.entries(this.setupMetadata(r)))
        if (si.metadata?.[k] !== v) throw new BillingError("SETUP_MISMATCH");
    }
    const ready = si?.status === "succeeded";
    let methodId: string | null = null;
    if (ready) {
      if (s.status !== "complete" || typeof si.payment_method !== "string")
        throw new BillingError("SETUP_MISMATCH");
      methodId = si.payment_method;
      await this.verifyMethod(r.accountId, c.id, methodId);
    }
    if (s.url && !/^https:\/\/checkout\.stripe\.com\//.test(s.url))
      throw new BillingError("UNSAFE_PAYMENT_URL");
    return {
      setupId: r.setupId,
      accountId: r.accountId,
      customerId: r.customerId,
      chefId: r.chefId,
      provider: "stripe",
      providerCustomerId: c.id,
      sessionId: s.id,
      paymentMethodId: methodId,
      setupIntentId: ready ? si.id : null,
      url: ready ? null : s.url,
      state: ready ? "ready" : "pending",
      livemode: false,
    };
  }
  private async verifyMethod(
    accountId: string,
    customerId: string,
    methodId: string,
  ) {
    const pm = await this.stripe.paymentMethods.retrieve(
      methodId,
      {},
      { stripeAccount: accountId },
    );
    if (
      pm.id !== methodId ||
      pm.livemode ||
      pm.customer !== customerId ||
      pm.type !== "card"
    )
      throw new BillingError("SAVED_METHOD_INVALID");
  }
  private metadata(r: AutopayRequest) {
    return {
      attemptId: r.attemptId,
      billId: r.billId,
      quoteId: r.quoteId,
      consentId: r.consentId,
      idempotencyKey: r.idempotencyKey,
    };
  }
  async create(r: AutopayRequest): Promise<AutopayObservation> {
    requireBillingTestMode();
    if (r.provider !== "stripe") throw new BillingError("PROVIDER_MISMATCH");
    await this.verifyMethod(
      r.accountId,
      r.providerCustomerId,
      r.paymentMethodId,
    );
    let intentId: string;
    try {
      const p = await this.stripe.paymentIntents.create(
        {
          amount: r.totalMinor,
          currency: r.currency.toLowerCase(),
          customer: r.providerCustomerId,
          payment_method: r.paymentMethodId,
          confirm: true,
          off_session: true,
          payment_method_types: ["card"],
          metadata: this.metadata(r),
        },
        { stripeAccount: r.accountId, idempotencyKey: r.idempotencyKey },
      );
      intentId = p.id;
    } catch (error: any) {
      // Declines/SCA may return an intent in an authenticated SDK response. Never trust its state: retrieve it.
      const p = error?.payment_intent;
      if (error?.type !== "StripeCardError" || !p?.id)
        throw new BillingError("AUTOPAY_RECONCILIATION_REQUIRED");
      intentId = p.id;
    }
    return this.retrieve(r, intentId);
  }
  async retrieve(
    r: AutopayRequest,
    intentId: string,
  ): Promise<AutopayObservation> {
    requireBillingTestMode();
    if (r.provider !== "stripe" || !/^pi_/.test(intentId))
      throw new BillingError("PROVIDER_MISMATCH");
    const p = await this.stripe.paymentIntents.retrieve(
      intentId,
      {},
      { stripeAccount: r.accountId },
    );
    if (
      p.id !== intentId ||
      p.livemode ||
      p.amount !== r.totalMinor ||
      p.currency !== r.currency.toLowerCase() ||
      p.customer !== r.providerCustomerId ||
      p.payment_method !== r.paymentMethodId ||
      p.capture_method !== "automatic"
    )
      throw new BillingError("PROVIDER_MISMATCH");
    for (const [k, v] of Object.entries(this.metadata(r)))
      if (p.metadata[k] !== v) throw new BillingError("PROVIDER_MISMATCH");
    let state: AutopayObservation["state"] = "processing";
    if (p.status === "succeeded") {
      if (p.amount_received !== r.totalMinor)
        throw new BillingError("PROVIDER_MISMATCH");
      state = "succeeded";
    } else if (p.status === "canceled") state = "canceled";
    else if (p.status === "requires_action") state = "requires_action";
    else if (p.status === "requires_payment_method") state = "failed";
    return { ...r, intentId: p.id, state, livemode: false };
  }
  async cancel(
    r: AutopayRequest,
    intentId: string,
  ): Promise<AutopayObservation> {
    requireBillingTestMode();
    const before = await this.retrieve(r, intentId);
    if (["succeeded", "canceled"].includes(before.state)) return before;
    if (!["failed", "requires_action"].includes(before.state))
      throw new BillingError("AUTOPAY_RECONCILIATION_REQUIRED");
    try {
      await this.stripe.paymentIntents.cancel(
        intentId,
        {},
        {
          stripeAccount: r.accountId,
          idempotencyKey: `${r.idempotencyKey}:cancel`,
        },
      );
    } catch {
      /* A racing success or ambiguous cancel is resolved by canonical retrieval. */
    }
    return this.retrieve(r, intentId);
  }
  verify(raw: Buffer, signature: string) {
    requireBillingTestMode();
    let e: Stripe.Event;
    try {
      e = this.stripe.webhooks.constructEvent(
        raw,
        signature,
        this.options.webhookSecret,
        300,
      );
    } catch {
      throw new BillingError("INVALID_WEBHOOK");
    }
    const p = e.data.object as Stripe.PaymentIntent;
    if (
      e.livemode ||
      !e.account ||
      !/^evt_/.test(e.id) ||
      ![
        "payment_intent.succeeded",
        "payment_intent.payment_failed",
        "payment_intent.requires_action",
        "payment_intent.processing",
        "payment_intent.canceled",
      ].includes(e.type) ||
      p.object !== "payment_intent" ||
      p.livemode ||
      !/^pi_/.test(p.id) ||
      !p.metadata?.attemptId
    )
      throw new BillingError("INVALID_WEBHOOK");
    return {
      eventId: e.id,
      accountId: e.account,
      attemptId: p.metadata.attemptId,
      intentId: p.id,
    };
  }
}
