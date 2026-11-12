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

test('native payment session data is round-tripped through Stripe metadata', async () => {
  const service = provider();
  await service.initiatePayment({ amount: 12, currency_code: 'usd',
    context: { idempotency_key: 'payses_fixture' }, data: { session_id: 'payses_fixture' } });
  const params = service.stripe_.paymentIntents.create.mock.calls[0][0];
  expect(params.metadata).toEqual({ session_id: 'payses_fixture' });
});
test.each([
  ['usd', 42525, 425.25], ['jpy', 425, 425], ['kwd', 425125, 425.125],
])('webhook %s amounts use Medusa currency units and preserve the session', async (currency, minor, major) => {
  const service = provider();
  for (const [type, action] of [['payment_intent.succeeded', 'captured'], ['payment_intent.amount_capturable_updated', 'authorized']]) {
    const result = await service.getWebhookActionAndData({ data: { type, data: { object: {
      id: 'pi_fixture', metadata: { session_id: 'payses_fixture' }, currency, amount: minor, amount_capturable: minor,
    } } } });
    expect(result.action).toBe(action);
    expect(result.data.session_id).toBe('payses_fixture');
    expect(Number(result.data.amount)).toBe(major);
  }
});
test('uncorrelated webhook does not substitute a Stripe intent ID for a Medusa session', async () => {
  const service = provider();
  expect(await service.getWebhookActionAndData({ data: { type: 'payment_intent.succeeded', data: { object: {
    id: 'pi_unrelated', metadata: {}, currency: 'usd', amount: 42525,
  } } } })).toMatchObject({ action: 'not_supported', data: { session_id: '' } });
});
