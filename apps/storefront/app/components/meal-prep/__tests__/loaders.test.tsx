/** @jest-environment node */
jest.mock('@libs/util/server/client.server', () => ({ baseMedusaConfig: { baseUrl: 'http://test.invalid', publishableKey: 'pk_test' } }));
jest.mock('@libs/util/server/config.server', () => ({ config: {} }));
jest.mock('@libs/util/server/cookies.server', () => ({ getSelectedRegionId: async () => 'region', setSelectedRegionId: jest.fn() }));
jest.mock('@libs/util/server/data/cart.server', () => ({ retrieveCart: async () => ({ id: 'cart', items: [] }), enrichLineItems: jest.fn() }));
jest.mock('@libs/util/server/data/customer.server', () => ({ getCustomer: async () => ({ id: 'customer' }) }));
jest.mock('@libs/util/server/products.server', () => ({ fetchProducts: async () => ({ products: [{ id: 'product' }] }) }));
jest.mock('@libs/util/server/data/regions.server', () => ({ getSelectedRegion: async () => ({ id: 'region' }), listRegions: async () => [{ id: 'region' }] }));
const { readMealPrep } = require('@libs/util/server/meal-prep.server');
const { loader: resourceLoader } = require('@app/routes/api.meal-prep');
const { loader: landingLoader } = require('@app/routes/meal-prep');
const { getRootLoader } = require('@libs/util/server/root.server');
const { parseMealPrep } = require('@libs/meal-prep');
const value = { status: 'available', can_request: false, methods: ['delivery'], selection_styles: ['package'] };
beforeEach(() => { global.fetch = jest.fn().mockResolvedValue({ ok: true, json: async () => value }); });
test('SD-11 initial root and landing loaders share a fresh request read; separate requests never cache', async () => {
  const request = new Request('http://localhost/meal-prep');
  const [root, landing] = await Promise.all([getRootLoader({ request } as any), landingLoader({ request } as any)]);
  expect(root.data.mealPrep).toEqual(landing.data.mealPrep);
  expect(fetch).toHaveBeenCalledTimes(1);
  expect(fetch).toHaveBeenCalledWith('http://test.invalid/store/meal-prep', expect.objectContaining({ cache: 'no-store', signal: expect.any(AbortSignal) }));
  await readMealPrep(new Request(request.url));
  expect(fetch).toHaveBeenCalledTimes(2);
});
test('SD-09/10 outage is 503 on resource and landing, but root cart/customer/product data survives', async () => {
  (fetch as jest.Mock).mockRejectedValue(new Error('PRIVATE secret'));
  const request = new Request('http://localhost/meal-prep');
  const [root, landing, resource] = await Promise.all([getRootLoader({ request } as any), landingLoader({ request } as any), resourceLoader({ request } as any)]);
  expect(root.data).toMatchObject({ mealPrep: { ok: false }, cart: { id: 'cart' }, customer: { id: 'customer' }, hasPublishedProducts: true });
  expect(landing.init?.status).toBe(503);
  expect(resource.status).toBe(503);
  expect(resource.headers.get('cache-control')).toBe('no-store');
  expect(await resource.text()).not.toMatch(/PRIVATE|not_offered/);
});
test('SD-08 proxy rejects unsafe eligibility and strips unexpected upstream fields', async () => {
  expect(parseMealPrep({ ...value, origin: 'PRIVATE', version: 42 })).toEqual(value);
  expect(() => parseMealPrep({ ...value, can_request: true })).toThrow();
  expect(() => parseMealPrep({ ...value, methods: [['delivery']] })).toThrow();
  expect(() => parseMealPrep({ ...value, methods: ['constructor'] })).toThrow();
  (fetch as jest.Mock).mockResolvedValue({ ok: true, json: async () => ({ ...value, methods: ['secret'] }) });
  expect(await readMealPrep(new Request('http://localhost'))).toEqual({ ok: false });
});
