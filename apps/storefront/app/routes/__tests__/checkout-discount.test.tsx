/** @jest-environment node */
jest.mock('@libs/util/server/client.server', () => ({ sdk: { store: { cart: { update: jest.fn() } } } }));
jest.mock('remix-hook-form', () => ({ getValidatedFormData: jest.fn(async () => ({ data: { cartId: 'cart_fixture', code: 'DINNER' } })) }));
const { action } = require('../api.checkout.discount-code');
const { sdk } = require('@libs/util/server/client.server');
const update = sdk.store.cart.update as jest.Mock;
beforeEach(() => jest.clearAllMocks());
test('upstream invalid-promotion 400 returns a recoverable form error', async () => {
  update.mockRejectedValue({ status: 400, message: 'Invalid promotion code' });
  const log = jest.spyOn(console, 'error').mockImplementation(() => {});
  try {
    const result = await action({ request: {} } as any);
    expect(result.init?.status).toBe(400);
    expect((result.data as any).errors.root.message).toBe('Discount code is invalid.');
  } finally { log.mockRestore(); }
});
test('an unapplied code is not reported as success', async () => {
  update.mockResolvedValue({ cart: { promotions: [] } });
  expect((await action({ request: {} } as any)).init?.status).toBe(400);
});
test('applied promotion returns the updated cart', async () => {
  const cart = { promotions: [{ code: 'DINNER' }] };
  update.mockResolvedValue({ cart });
  expect((await action({ request: {} } as any)).data).toEqual({ cart });
});
