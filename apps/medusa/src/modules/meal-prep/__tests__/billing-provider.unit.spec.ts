import Stripe from "stripe";
import { StripeTestManualProvider } from "../stripe-test-manual-provider";
import { testCommerceInputs, usdMajor } from "../medusa-test-billing-adapter";
import {
  requireBillingTestMode,
  type PaymentRequest,
} from "../billing-contracts";
import { mealPrepFeatures } from "../feature-controls";

const options = {
  apiKey: "sk_test_fixture_only",
  webhookSecret: "whsec_fixture_only",
  successUrl: "http://localhost:8000/test/success",
  cancelUrl: "http://localhost:8000/test/cancel",
};
const request: PaymentRequest = {
  attemptId: "attempt",
  billId: "bill",
  quoteId: "quote",
  accountId: "acct_testchef",
  currency: "USD",
  totalMinor: 1000,
  idempotencyKey: "meal-prep:attempt",
};
const metadata = {
  attemptId: "attempt",
  billId: "bill",
  quoteId: "quote",
  idempotencyKey: "meal-prep:attempt",
};
const session = () => ({
  id: "cs_test_fixture",
  object: "checkout.session",
  mode: "payment",
  livemode: false,
  client_reference_id: "attempt",
  amount_total: 1000,
  currency: "usd",
  metadata: { ...metadata },
  url: "https://checkout.stripe.com/c/pay/fixture",
  status: "open",
  payment_status: "unpaid",
  payment_intent: null,
  expires_at: Math.floor(Date.now() / 1000) + 3600,
});
const intent = () => ({
  id: "pi_fixture",
  livemode: false,
  amount: 1000,
  amount_received: 1000,
  currency: "usd",
  metadata: { ...metadata },
  status: "succeeded",
});
describe("dedicated Stripe Connect test-mode manual provider", () => {
  let provider: StripeTestManualProvider, stripe: any;
  beforeEach(() => {
    provider = new StripeTestManualProvider(options);
    stripe = (provider as any).stripe;
    jest.spyOn(stripe.checkout.sessions, "create").mockResolvedValue(session());
    jest
      .spyOn(stripe.checkout.sessions, "retrieve")
      .mockResolvedValue(session());
  });
  afterEach(() => jest.restoreAllMocks());
  it("creates only a hosted manual session, scoped to the account and durable idempotency key", async () => {
    expect(await provider.create(request)).toMatchObject({
      state: "open",
      totalMinor: 1000,
      livemode: false,
    });
    expect(stripe.checkout.sessions.create).toHaveBeenCalledWith(
      {
        mode: "payment",
        payment_method_types: ["card"],
        client_reference_id: "attempt",
        metadata,
        payment_intent_data: { metadata },
        line_items: [
          {
            quantity: 1,
            price_data: {
              currency: "usd",
              unit_amount: 1000,
              product_data: { name: "Meal prep approved occurrence (test)" },
            },
          },
        ],
        success_url: options.successUrl,
        cancel_url: options.cancelUrl,
      },
      { stripeAccount: "acct_testchef", idempotencyKey: "meal-prep:attempt" },
    );
    expect(stripe.checkout.sessions.retrieve).toHaveBeenCalledWith(
      "cs_test_fixture",
      { expand: ["payment_intent"] },
      { stripeAccount: "acct_testchef" },
    );
    const body = JSON.stringify(stripe.checkout.sessions.create.mock.calls[0]);
    for (const excluded of [
      "application_fee_amount",
      "off_session",
      "setup_future_usage",
      "subscription",
      "household",
      "EVENT-",
    ])
      expect(body).not.toContain(excluded);
  });
  it("requires paid completed Checkout AND an exact succeeded PaymentIntent", async () => {
    stripe.checkout.sessions.retrieve.mockResolvedValue({
      ...session(),
      status: "complete",
      payment_status: "unpaid",
    });
    expect((await provider.retrieve(request, "cs_test_fixture")).state).toBe(
      "processing",
    );
    stripe.checkout.sessions.retrieve.mockResolvedValue({
      ...session(),
      status: "complete",
      payment_status: "paid",
      payment_intent: intent(),
    });
    expect((await provider.retrieve(request, "cs_test_fixture")).state).toBe(
      "succeeded",
    );
    stripe.checkout.sessions.retrieve.mockResolvedValue({
      ...session(),
      status: "complete",
      payment_status: "paid",
      payment_intent: { ...intent(), amount_received: 999 },
    });
    await expect(provider.retrieve(request, "cs_test_fixture")).rejects.toThrow(
      "PROVIDER_MISMATCH",
    );
  });
  it.each([
    { amount_total: 10 },
    { currency: "eur" },
    { livemode: true },
    { metadata: { ...metadata, quoteId: "wrong" } },
    {
      payment_intent: {
        ...intent(),
        metadata: { ...metadata, billId: "wrong" },
      },
    },
    { payment_intent: { ...intent(), amount: 10 } },
    { mode: "subscription" },
    { client_reference_id: "other" },
    { url: "https://attacker.example/pay" },
  ])("rejects forged or inconsistent provider data %j", async (extra) => {
    stripe.checkout.sessions.retrieve.mockResolvedValue({
      ...session(),
      ...extra,
    });
    await expect(
      provider.retrieve(request, "cs_test_fixture"),
    ).rejects.toThrow();
  });
  it.each(["requires_action", "requires_payment_method", "processing"])(
    "does not collect for intent status %s",
    async (status) => {
      stripe.checkout.sessions.retrieve.mockResolvedValue({
        ...session(),
        payment_intent: {
          ...intent(),
          status,
          last_payment_error: { code: "card_declined" },
        },
      });
      expect(
        (await provider.retrieve(request, "cs_test_fixture")).state,
      ).not.toBe("succeeded");
    },
  );
  const payload = (extra: any = {}) =>
    JSON.stringify({
      id: "evt_fixture",
      object: "event",
      account: "acct_testchef",
      livemode: false,
      type: "checkout.session.completed",
      data: { object: session() },
      ...extra,
    });
  const sign = (body: string, timestamp?: number) =>
    Stripe.webhooks.generateTestHeaderString({
      payload: body,
      secret: options.webhookSecret,
      timestamp,
    });
  it("verifies authentic raw bytes with real Stripe HMAC and rejects forged, stale and modified payloads", () => {
    const raw = payload(),
      signature = sign(raw);
    expect(provider.verify(Buffer.from(raw), signature)).toEqual({
      eventId: "evt_fixture",
      accountId: "acct_testchef",
      sessionId: "cs_test_fixture",
      attemptId: "attempt",
    });
    expect(() => provider.verify(Buffer.from(raw), "t=1,v1=forged")).toThrow(
      "INVALID_WEBHOOK",
    );
    expect(() => provider.verify(Buffer.from(`${raw} `), signature)).toThrow(
      "INVALID_WEBHOOK",
    );
    expect(() =>
      provider.verify(
        Buffer.from(raw),
        sign(raw, Math.floor(Date.now() / 1000) - 301),
      ),
    ).toThrow("INVALID_WEBHOOK");
  });
  it.each([
    { livemode: true },
    { account: null },
    { type: "payment_intent.succeeded" },
    { data: { object: { ...session(), id: "cs_live_forbidden" } } },
  ])("rejects signed but unsupported events %j", (extra) => {
    const raw = payload(extra);
    expect(() => provider.verify(Buffer.from(raw), sign(raw))).toThrow();
  });
  it("rejects live credentials, unsafe return URLs and all non-test runtime execution", () => {
    expect(
      () =>
        new StripeTestManualProvider({
          ...options,
          apiKey: "sk_live_forbidden",
        }),
    ).toThrow("TEST_CREDENTIALS_REQUIRED");
    expect(
      () =>
        new StripeTestManualProvider({
          ...options,
          successUrl: "https://customer.example/pay",
        }),
    ).toThrow("TEST_RETURN_URL_REQUIRED");
    const previous = process.env.NODE_ENV;
    try {
      process.env.NODE_ENV = "production";
      expect(() => requireBillingTestMode()).toThrow("BILLING_DISABLED");
      expect(() => new StripeTestManualProvider(options)).toThrow(
        "BILLING_DISABLED",
      );
    } finally {
      process.env.NODE_ENV = previous;
    }
    expect(Object.values(mealPrepFeatures).every((v) => v === false)).toBe(
      true,
    );
  });
});
describe("installed Medusa 2.7 amount and dedicated resource boundary", () => {
  it.each([
    [1, "0.01"],
    [1000, "10.00"],
    [1050, "10.50"],
    [99999999, "999999.99"],
  ])("round-trips integer minor amount %s", (minor, major) => {
    expect(usdMajor(minor as number)).toBe(major);
    expect(Math.round(Number(major) * 100)).toBe(minor);
  });
  it("creates explicit major-unit DTOs with no ticket, inventory, servings or legacy fee classification", () => {
    const dto = testCommerceInputs({
      billId: "bill",
      quoteId: "quote",
      subjectId: "occurrence",
      currency: "USD",
      totalMinor: 1000,
    });
    expect(dto.collection.amount).toBe("10.00");
    expect(dto.order.items![0].unit_price).toBe("10.00");
    expect(dto.order.no_notification).toBe(true);
    expect(dto.order.items![0]).not.toHaveProperty("variant_id");
    expect(dto.order.items![0]).not.toHaveProperty("product_id");
    expect(dto.order.items![0]).not.toHaveProperty("variant_sku");
  });
});
