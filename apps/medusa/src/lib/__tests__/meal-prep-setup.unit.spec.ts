import { availabilitySettingsSchema, emptyMealPrepSetup, mealPrepSetupSchema } from '../availability/slots';
import { cleanSettings } from '../../admin/components/availability/editor';
import { mealPrepFeatures } from '../../modules/meal-prep/feature-controls';
import { GET, POST } from '../../api/admin/availability/route';
import { GET as review } from '../../api/admin/availability/meal-prep-review/route';

const settings = {
  timezone: 'UTC',
  weekly: {},
  overrides: {},
  google_mode: 'internal_only' as const,
  version: 7,
};
test('all eight independent fulfillment combinations and all sixteen style combinations are draftable', () => {
  for (let methods = 0; methods < 8; methods++)
    for (let styles = 0; styles < 16; styles++) {
      const setup = emptyMealPrepSetup();
      Object.keys(setup.methods).forEach((m, i) => {
        setup.methods[m as 'pickup'].enabled = !!(methods & (1 << i));
      });
      Object.keys(setup.selection_styles).forEach((s, i) => {
        setup.selection_styles[s as 'package'] = !!(styles & (1 << i));
      });
      expect(mealPrepSetupSchema.parse(setup)).toEqual(setup);
    }
  expect(Object.values(mealPrepFeatures).every((enabled) => !enabled)).toBe(true);
});
test('cleaner roundtrips complete draft snapshots and version without persistence metadata', () => {
  const meal_prep = emptyMealPrepSetup();
  meal_prep.delivery_area = {
    radius: { address: 'Unverified address', distance: 0.5, unit: 'km' },
    zip_codes: ['00501', '10001-1234'],
  };
  const value = { ...settings, meal_prep };
  expect(availabilitySettingsSchema.parse(value)).toEqual(value);
  expect(cleanSettings({ ...value, id: 'chef-default', updated_at: 'ignored' } as never)).toEqual(value);
  expect(cleanSettings({ ...value, meal_prep: null }).meal_prep).toBeNull();
});
test.each([
  { max_orders: 20 },
  { remaining_servings: 10 },
  { customer_eligibility: true },
  { delivery_area: { radius: null, zip_codes: [], combination: 'union' } },
  { delivery_area: { radius: { address: '', distance: 0, unit: 'mi' }, zip_codes: [] } },
  { delivery_area: { radius: null, zip_codes: ['123', '12345'] } },
  { delivery_area: { radius: null, zip_codes: ['12345', '12345'] } },
])('rejects invalid or unapproved settings %j', (patch) => {
  expect(mealPrepSetupSchema.safeParse({ ...emptyMealPrepSetup(), ...patch }).success).toBe(false);
});
test('method schedules validate dates and overlapping windows without applying global closure policy', () => {
  const setup = emptyMealPrepSetup();
  setup.methods.pickup.dates = { '2026-02-30': [] };
  expect(mealPrepSetupSchema.safeParse(setup).success).toBe(false);
  setup.methods.pickup.dates = {
    '2026-11-02': [
      { start: '10:00', end: '12:00' },
      { start: '11:00', end: '13:00' },
    ],
  };
  expect(mealPrepSetupSchema.safeParse(setup).success).toBe(false);
  setup.methods.pickup.dates = { '2026-11-02': [{ start: '10:00', end: '12:00' }] };
  expect(
    availabilitySettingsSchema.parse({ ...settings, overrides: { '2026-11-02': [] }, meal_prep: setup })
      .overrides,
  ).toEqual({ '2026-11-02': [] });
});
test('work plans need explicit valid intervals; no duration inferred from orders or servings', () => {
  const setup = emptyMealPrepSetup();
  const work = {
    id: 'work',
    purpose: 'preparation' as const,
    start: '2026-11-02T10:00:00Z',
    end: '2026-11-02T11:00:00Z',
  };
  setup.work_plans = [work];
  expect(mealPrepSetupSchema.safeParse(setup).success).toBe(true);
  setup.work_plans = [work, work];
  expect(mealPrepSetupSchema.safeParse(setup).success).toBe(false);
  setup.work_plans = [{ ...work, end: work.start }];
  expect(mealPrepSetupSchema.safeParse(setup).success).toBe(false);
});
test.each([GET, POST, review])(
  'availability handlers reject anonymous/customer actors before resolving services',
  async (handler) => {
    for (const auth_context of [
      undefined,
      { actor_type: 'customer', actor_id: 'customer' },
      { actor_type: 'user', actor_id: '' },
    ]) {
      const resolve = jest.fn();
      const res = { status: jest.fn(), json: jest.fn() };
      res.status.mockReturnValue(res);
      await handler({ auth_context, scope: { resolve } } as never, res as never);
      expect(res.status).toHaveBeenCalledWith(401);
      expect(resolve).not.toHaveBeenCalled();
    }
  },
);
test('admin writes require a revision and reject actor/resource injection; work review has explicit bounded inputs', async () => {
  for (const body of [
    { ...settings, version: undefined },
    { ...settings, chef_id: 'other-chef' },
  ]) {
    const res = { status: jest.fn(), json: jest.fn() };
    res.status.mockReturnValue(res);
    await POST({ auth_context: { actor_type: 'user', actor_id: 'admin' }, body } as never, res as never);
    expect(res.status).toHaveBeenCalledWith(400);
  }
  const reviewWorkBlocks = jest.fn().mockResolvedValue([{ id: 'work', linked_occurrences: 500 }]);
  const req = {
    auth_context: { actor_type: 'user', actor_id: 'admin' },
    scope: { resolve: () => ({ reviewWorkBlocks }) },
    query: { start: '2026-11-02T00:00:00Z', end: '2026-11-03T00:00:00Z' },
  };
  const res = { status: jest.fn(), json: jest.fn() };
  res.status.mockReturnValue(res);
  await review(req as never, res as never);
  expect(res.json).toHaveBeenCalledWith({
    blocks: [{ id: 'work', linked_occurrences: 500 }],
    order_serving_totals: null,
  });
  await review({ ...req, query: { ...req.query, end: '2027-11-03T00:00:00Z' } } as never, res as never);
  expect(res.status).toHaveBeenCalledWith(400);
  expect(reviewWorkBlocks).toHaveBeenCalledTimes(1);
});
