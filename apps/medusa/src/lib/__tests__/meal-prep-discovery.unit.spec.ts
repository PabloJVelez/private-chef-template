import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { emptyMealPrepSetup } from '../availability/slots';
import { discoveryMethods, evaluateMealPrepDiscovery } from '../meal-prep-discovery';
import * as route from '../../api/store/meal-prep/route';
import { mealPrepFeatures } from '../../modules/meal-prep/feature-controls';
const project = (setup: unknown) => evaluateMealPrepDiscovery(setup).projection;

describe('discovery contract v1.2/r5, matrix r3', () => {
  test.each([undefined, null, emptyMealPrepSetup()])('SD-04 missing/null/off is not offered without initialization', (setup) => {
    expect(project(setup)).toEqual({ status: 'not_offered', can_request: false, methods: [], selection_styles: [] });
  });
  test.each(discoveryMethods)('SD-05/17 %s permits generic information without offers, area or location', (method) => {
    const setup = emptyMealPrepSetup(); setup.methods[method].enabled = true;
    expect(project(setup)).toEqual({ status: 'available', can_request: false, methods: [method], selection_styles: [] });
  });
  test('SD-06 malformed delivery cannot hide valid in-home information', () => {
    const setup = emptyMealPrepSetup(); setup.methods.in_home.enabled = true;
    (setup.methods as any).delivery = { enabled: true };
    expect(project(setup).methods).toEqual(['in_home']);
    setup.methods.in_home.enabled = false;
    expect(project(setup).status).toBe('unavailable');
    expect(project({ methods: 'invalid' }).status).toBe('unavailable');
    expect(project({ methods: { pickup: { enabled: 'true' } } }).status).toBe('unavailable');
  });
  test('SD-07/08 only known enabled identifiers leave the evaluator', () => {
    const setup = emptyMealPrepSetup(); setup.methods.delivery.enabled = true;
    setup.selection_styles.package = true;
    const result = project({ ...setup, delivery_area: { radius: { address: 'PRIVATE HOME', distance: 10, unit: 'mi' } },
      work_plans: ['PRIVATE PLAN'], household: { access: 'SECRET CODE' }, provider: { secret: 'TOKEN' },
      selection_styles: { ...setup.selection_styles, tailored_plan: 'true', secret: true }, internal_blockers: ['PRIVATE'], unpublished_offers: ['PRIVATE PRICE'] });
    expect(result).toEqual({ status: 'available', can_request: false, methods: ['delivery'], selection_styles: ['package'] });
    expect(Object.keys(result).sort()).toEqual(['can_request', 'methods', 'selection_styles', 'status']);
  });
  test('SD-09 HTTP 503 is safe, retryable and uncached', async () => {
    const res = { setHeader: jest.fn(), status: jest.fn().mockReturnThis(), json: jest.fn() };
    await route.GET({ scope: { resolve: () => { throw new Error('PRIVATE connection secret'); } } } as any, res as any);
    expect(res.setHeader).toHaveBeenCalledWith('Cache-Control', 'no-store');
    expect(res.status).toHaveBeenCalledWith(503);
    expect(res.json).toHaveBeenCalledWith({ message: 'Meal Prep information is temporarily unavailable. Please try again.', retryable: true });
  });
  test('SD-16 Store exports GET only and execution flags remain frozen', () => {
    expect(Object.keys(route)).toEqual(['GET']);
    expect(Object.values(mealPrepFeatures).every((enabled) => enabled === false)).toBe(true);
    const source = readFileSync(resolve(__dirname, '../../api/store/meal-prep/route.ts'), 'utf8');
    expect(source).not.toMatch(/stripe|resend|saveSchedule|customerAccess/);
  });
});
