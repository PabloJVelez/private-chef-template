import StripeConnectProviderService from "../service";
import { PaymentSessionStatus } from "@medusajs/framework/utils";

describe("existing private-event Connect checkout regression", () => {
  let provider: StripeConnectProviderService, stripe: any;
  beforeEach(() => {
    provider = new StripeConnectProviderService(
      {
        logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() } as any,
        stripeConnectAccountModuleService: {
          getConnectedAccountId: async () => "acct_event",
        },
      },
      { apiKey: "sk_test_fixture", captureMethod: "manual" },
    );
    stripe = (provider as any).stripe_;
    // Fix the pre-existing event fee fixture explicitly; this is not meal-prep fee policy.
    (provider as any).config_.feePerUnitBased = false;
    (provider as any).config_.feePercent = 5;
  });
  afterEach(() => jest.restoreAllMocks());
  it("retains existing amount conversion, account, manual capture and fee without off-session charging", async () => {
    jest
      .spyOn(stripe.paymentIntents, "create")
      .mockResolvedValue({
        id: "pi_event",
        status: "requires_payment_method",
        client_secret: "test_secret",
      });
    const result = await provider.initiatePayment({
      amount: 10,
      currency_code: "usd",
      context: { session_id: "event-session" },
    } as any);
    expect(stripe.paymentIntents.create).toHaveBeenCalledWith(
      {
        amount: 1000,
        currency: "usd",
        capture_method: "manual",
        metadata: { session_id: "event-session", resource_id: "" },
        automatic_payment_methods: { enabled: true },
        application_fee_amount: 50,
      },
      { stripeAccount: "acct_event" },
    );
    expect(result.data).toMatchObject({
      connected_account_id: "acct_event",
      amount: 1000,
      application_fee_amount: 50,
    });
  });
  it("authorizes and captures the existing intent on its original account without creating a new charge", async () => {
    const retrieve = jest
      .spyOn(stripe.paymentIntents, "retrieve")
      .mockResolvedValue({
        id: "pi_event",
        status: "requires_capture",
        amount: 1000,
        currency: "usd",
        application_fee_amount: 50,
      });
    const capture = jest
      .spyOn(stripe.paymentIntents, "capture")
      .mockResolvedValue({
        id: "pi_event",
        status: "succeeded",
        amount: 1000,
        currency: "usd",
        application_fee_amount: 50,
      });
    const create = jest.spyOn(stripe.paymentIntents, "create");
    const data = { id: "pi_event", connected_account_id: "acct_event" };
    expect((await provider.authorizePayment({ data })).status).toBe(
      PaymentSessionStatus.AUTHORIZED,
    );
    expect((await provider.capturePayment({ data })).data).toMatchObject({
      status: "succeeded",
      connected_account_id: "acct_event",
      amount: 1000,
    });
    expect(capture).toHaveBeenCalledWith("pi_event", undefined, {
      stripeAccount: "acct_event",
    });
    retrieve.mockResolvedValue({
      id: "pi_event",
      status: "succeeded",
      amount: 1000,
      currency: "usd",
    });
    await provider.capturePayment({ data });
    expect(capture).toHaveBeenCalledTimes(1);
    expect(create).not.toHaveBeenCalled();
  });
});
