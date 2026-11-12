import StripeConnectProviderService from '../../modules/stripe-connect/service';

// Real provider methods, mocked Stripe transport: no sandbox/live payment is made.
function provider() {
  const service: any = Object.create(StripeConnectProviderService.prototype);
  const intent = { id: 'pi_fixture', status: 'requires_capture', amount: 1200, currency: 'usd' };
  service.config_ = { feePercent: 0, feePerUnitBased: false, captureMethod: 'manual' };
  service.logger_ = { info() {}, warn() {}, error() {} };
  service.getConnectedAccount = async () => ({ stripe_account_id: 'acct_fixture', account_type: 'express' });
  service.stripe_ = {
    paymentIntents: Object.fromEntries(['create', 'capture', 'cancel', 'update', 'retrieve'].map((method) => [method, jest.fn(async () => intent)])),
    refunds: { create: jest.fn(async () => ({ id: 're_fixture', amount: 1200 })) },
  };
  return service;
}
test.each(['initiatePayment', 'capturePayment', 'refundPayment', 'cancelPayment', 'deletePayment', 'updatePayment'])(
  '%s forwards the native retry key and connected account to Stripe', async (method) => {
    const service = provider();
    const input = { amount: 12, currency_code: 'usd', context: { idempotency_key: 'native-operation' },
      data: { id: 'pi_fixture', connected_account_id: 'acct_fixture', currency_code: 'usd' } };
    await service[method](input);
    await service[method](input);
    const mutation = method === 'refundPayment' ? service.stripe_.refunds.create : service.stripe_.paymentIntents[
      ({ initiatePayment: 'create', capturePayment: 'capture', cancelPayment: 'cancel', deletePayment: 'cancel', updatePayment: 'update' } as Record<string, string>)[method]
    ];
    expect(mutation).toHaveBeenCalledTimes(2);
    for (const call of mutation.mock.calls) expect(call.at(-1)).toEqual({ stripeAccount: 'acct_fixture', idempotencyKey: 'native-operation' });
  },
);
