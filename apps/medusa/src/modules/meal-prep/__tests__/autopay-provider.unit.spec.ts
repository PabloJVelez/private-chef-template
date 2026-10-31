import Stripe from "stripe";
import { StripeTestAutopayProvider } from "../stripe-test-autopay-provider";
import { mealPrepFeatures } from "../feature-controls";
import {
  AutopayPreCreateRejection,
  autopayCommandSchema,
  type AutopayRequest,
  type SetupRequest,
} from "../autopay-contracts";
import {
  dispatchTestAutopay,
  dispatchTestTimedNotification,
} from "../autopay-worker";
const options = {
  apiKey: "sk_test_fixture",
  webhookSecret: "whsec_fixture",
  successUrl: "http://localhost/test/success",
  cancelUrl: "http://localhost/test/cancel",
};
const r: AutopayRequest = {
  attemptId: "attempt",
  billId: "bill",
  quoteId: "quote",
  accountId: "acct_chef",
  currency: "USD",
  totalMinor: 1000,
  idempotencyKey: "autopay:attempt",
  consentId: "consent",
  provider: "stripe",
  providerCustomerId: "cus_customer",
  paymentMethodId: "pm_card",
};
const sr: SetupRequest = {
  setupId: "setup",
  accountId: "acct_chef",
  customerId: "customer",
  chefId: "chef",
  idempotencyKey: "setup:setup",
};
const metadata = {
  attemptId: r.attemptId,
  billId: r.billId,
  quoteId: r.quoteId,
  consentId: r.consentId,
  idempotencyKey: r.idempotencyKey,
};
const sm = {
  setupId: sr.setupId,
  customerId: sr.customerId,
  chefId: sr.chefId,
};
const pi = (extra: any = {}) => ({
  id: "pi_auto",
  object: "payment_intent",
  livemode: false,
  amount: 1000,
  amount_received: 1000,
  currency: "usd",
  customer: r.providerCustomerId,
  payment_method: r.paymentMethodId,
  capture_method: "automatic",
  metadata,
  status: "succeeded",
  ...extra,
});
const session = () => ({
  id: "cs_test_setup",
  mode: "setup",
  livemode: false,
  metadata: sm,
  status: "complete",
  url: null,
  customer: { id: "cus_customer", livemode: false, metadata: sm },
  setup_intent: {
    id: "seti_setup",
    livemode: false,
    customer: "cus_customer",
    usage: "off_session",
    status: "succeeded",
    payment_method: "pm_card",
    metadata: sm,
  },
});
describe("isolated Stripe Connect test setup and autopay", () => {
  let p: StripeTestAutopayProvider, stripe: any;
  beforeEach(() => {
    p = new StripeTestAutopayProvider(options);
    stripe = (p as any).stripe;
    jest
      .spyOn(stripe.customers, "create")
      .mockResolvedValue({ id: "cus_customer", livemode: false });
    jest.spyOn(stripe.checkout.sessions, "create").mockResolvedValue(session());
    jest
      .spyOn(stripe.checkout.sessions, "retrieve")
      .mockResolvedValue(session());
    jest.spyOn(stripe.paymentMethods, "retrieve").mockResolvedValue({
      id: "pm_card",
      customer: "cus_customer",
      type: "card",
      livemode: false,
    });
    jest.spyOn(stripe.paymentIntents, "create").mockResolvedValue(pi());
    jest.spyOn(stripe.paymentIntents, "retrieve").mockResolvedValue(pi());
    jest
      .spyOn(stripe.paymentIntents, "cancel")
      .mockResolvedValue(pi({ status: "canceled" }));
  });
  afterEach(() => jest.restoreAllMocks());
  it("creates account-scoped customer and hosted setup with stable keys and stores only references", async () => {
    const result = await p.createSetup(sr);
    expect(result).toMatchObject({
      state: "ready",
      paymentMethodId: "pm_card",
      providerCustomerId: "cus_customer",
      livemode: false,
    });
    expect(stripe.customers.create).toHaveBeenCalledWith(
      { metadata: sm },
      { stripeAccount: "acct_chef", idempotencyKey: "setup:setup:customer" },
    );
    expect(stripe.checkout.sessions.create).toHaveBeenCalledWith(
      expect.objectContaining({
        mode: "setup",
        customer: "cus_customer",
        payment_method_types: ["card"],
      }),
      { stripeAccount: "acct_chef", idempotencyKey: "setup:setup" },
    );
    expect(stripe.paymentMethods.retrieve).toHaveBeenCalledWith(
      "pm_card",
      {},
      { stripeAccount: "acct_chef" },
    );
    expect(result).not.toHaveProperty("card");
    expect(result).not.toHaveProperty("client_secret");
  });
  it.each([
    {
      customer: {
        id: "cus_customer",
        metadata: { ...sm, customerId: "other" },
        livemode: false,
      },
    },
    { livemode: true },
    { mode: "payment" },
    { metadata: { ...sm, setupId: "forged" } },
    { setup_intent: { ...session().setup_intent, customer: "cus_other" } },
    { setup_intent: { ...session().setup_intent, usage: "on_session" } },
    {
      setup_intent: {
        ...session().setup_intent,
        metadata: { ...sm, chefId: "other" },
      },
    },
  ])("rejects setup/owner/account association mismatch %j", async (extra) => {
    stripe.checkout.sessions.retrieve.mockResolvedValue({
      ...session(),
      ...extra,
    });
    await expect(p.retrieveSetup(sr, "cs_test_setup")).rejects.toThrow(
      "SETUP_MISMATCH",
    );
  });
  it.each([
    { customer: null },
    { customer: "cus_other" },
    { livemode: true },
    { type: "bank_account" },
  ])("rejects detached/reassigned/invalid saved methods %j", async (extra) => {
    stripe.paymentMethods.retrieve.mockResolvedValue({
      id: "pm_card",
      customer: "cus_customer",
      type: "card",
      livemode: false,
      ...extra,
    });
    await expect(p.create(r)).rejects.toBeInstanceOf(AutopayPreCreateRejection);
    expect(stripe.paymentIntents.create).not.toHaveBeenCalled();
  });
  it("does not classify a method lookup timeout as a definitive rejection", async () => {
    const timeout = new Error("lookup timeout");
    stripe.paymentMethods.retrieve.mockRejectedValue(timeout);
    await expect(p.create(r)).rejects.toBe(timeout);
    expect(stripe.paymentIntents.create).not.toHaveBeenCalled();
  });
  it("uses exact approved minor units, explicit off-session confirmation and account-scoped idempotency", async () => {
    expect((await p.create(r)).state).toBe("succeeded");
    expect(stripe.paymentIntents.create).toHaveBeenCalledWith(
      {
        amount: 1000,
        currency: "usd",
        customer: "cus_customer",
        payment_method: "pm_card",
        confirm: true,
        off_session: true,
        payment_method_types: ["card"],
        metadata,
      },
      { stripeAccount: "acct_chef", idempotencyKey: "autopay:attempt" },
    );
    const body = stripe.paymentIntents.create.mock.calls[0][0];
    expect(body).not.toHaveProperty("application_fee_amount");
    expect(body).not.toHaveProperty("subscription");
  });
  it.each(["requires_action", "requires_payment_method"])(
    "reconciles SDK card errors using canonical retrieval (%s)",
    async (status) => {
      stripe.paymentIntents.create.mockRejectedValue({
        type: "StripeCardError",
        payment_intent: { id: "pi_auto" },
      });
      stripe.paymentIntents.retrieve.mockResolvedValue(pi({ status }));
      expect((await p.create(r)).state).toBe(
        status === "requires_action" ? "requires_action" : "failed",
      );
    },
  );
  it.each([
    { livemode: true },
    { amount: 999 },
    { amount_received: 999 },
    { currency: "eur" },
    { customer: "cus_other" },
    { payment_method: "pm_other" },
    { metadata: { ...metadata, consentId: "other" } },
    { capture_method: "manual" },
  ])("rejects mismatched collection %j", async (extra) => {
    stripe.paymentIntents.retrieve.mockResolvedValue(pi(extra));
    await expect(p.retrieve(r, "pi_auto")).rejects.toThrow("PROVIDER_MISMATCH");
  });
  it("does not assume timeout is a decline or cancellation", async () => {
    stripe.paymentIntents.create.mockRejectedValue(new Error("timeout"));
    await expect(p.create(r)).rejects.toThrow("RECONCILIATION_REQUIRED");
    stripe.paymentIntents.retrieve.mockResolvedValue(
      pi({ status: "requires_action" }),
    );
    stripe.paymentIntents.cancel.mockRejectedValue(new Error("timeout"));
    expect((await p.cancel(r, "pi_auto")).state).toBe("requires_action");
  });
  it("checks canonical cancellation, including success racing a cancel request", async () => {
    stripe.paymentIntents.retrieve
      .mockResolvedValueOnce(pi({ status: "requires_action" }))
      .mockResolvedValueOnce(pi());
    expect((await p.cancel(r, "pi_auto")).state).toBe("succeeded");
    expect(stripe.paymentIntents.cancel).toHaveBeenCalledWith(
      "pi_auto",
      {},
      { stripeAccount: "acct_chef", idempotencyKey: "autopay:attempt:cancel" },
    );
  });
  const raw = (extra: any = {}) =>
    JSON.stringify({
      id: "evt_auto",
      object: "event",
      account: "acct_chef",
      livemode: false,
      type: "payment_intent.succeeded",
      data: { object: pi() },
      ...extra,
    });
  const sign = (body: string, timestamp?: number) =>
    Stripe.webhooks.generateTestHeaderString({
      payload: body,
      secret: options.webhookSecret,
      timestamp,
    });
  it("authenticates original webhook bytes and rejects forged, stale and altered payloads", () => {
    const body = raw(),
      signature = sign(body);
    expect(p.verify(Buffer.from(body), signature)).toEqual({
      eventId: "evt_auto",
      accountId: "acct_chef",
      attemptId: "attempt",
      intentId: "pi_auto",
    });
    expect(() => p.verify(Buffer.from(body), "forged")).toThrow(
      "INVALID_WEBHOOK",
    );
    expect(() => p.verify(Buffer.from(body + " "), signature)).toThrow(
      "INVALID_WEBHOOK",
    );
    expect(() =>
      p.verify(
        Buffer.from(body),
        sign(body, Math.floor(Date.now() / 1000) - 301),
      ),
    ).toThrow("INVALID_WEBHOOK");
  });
  it.each([
    { livemode: true },
    { account: null },
    { type: "invoice.paid" },
    { data: { object: pi({ livemode: true }) } },
  ])("rejects signed unsupported events %j", (extra) => {
    const body = raw(extra);
    expect(() => p.verify(Buffer.from(body), sign(body))).toThrow(
      "INVALID_WEBHOOK",
    );
  });
  it("keeps production execution, live credentials and timing defaults disabled", async () => {
    expect(
      () =>
        new StripeTestAutopayProvider({
          ...options,
          apiKey: "sk_live_forbidden",
        }),
    ).toThrow("TEST_CREDENTIALS_REQUIRED");
    expect(
      () =>
        new StripeTestAutopayProvider({
          ...options,
          successUrl: "https://customer.example/pay",
        }),
    ).toThrow("TEST_RETURN_URL_REQUIRED");
    expect(Object.values(mealPrepFeatures).every((x) => x === false)).toBe(
      true,
    );
    const previous = process.env.NODE_ENV;
    try {
      process.env.NODE_ENV = "production";
      expect(() => new StripeTestAutopayProvider(options)).toThrow(
        "BILLING_DISABLED",
      );
      await expect(p.create(r)).rejects.toThrow("BILLING_DISABLED");
      await expect(dispatchTestAutopay({} as any, p, "id")).rejects.toThrow(
        "BILLING_DISABLED",
      );
      await expect(
        dispatchTestTimedNotification({} as any, {} as any, "id"),
      ).rejects.toThrow("BILLING_DISABLED");
    } finally {
      process.env.NODE_ENV = previous;
    }
    expect(
      autopayCommandSchema.safeParse({
        operation: "schedule",
        subjectId: "o",
        billId: "b",
        quoteId: "q",
        expectedVersion: 1,
        idempotencyKey: "key",
        kind: "autopay",
      }).success,
    ).toBe(false);
  });
});
