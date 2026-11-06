import { mealPrepSetupSchema } from './availability/slots';

const methodSchemas = mealPrepSetupSchema.shape.methods.shape;
export const discoveryMethods = ['in_home', 'delivery', 'pickup'] as const;
export const discoveryStyles = ['individual_dishes', 'package', 'chosen_menu', 'tailored_plan'] as const;
export type DiscoveryMethod = (typeof discoveryMethods)[number];
export type DiscoveryStyle = (typeof discoveryStyles)[number];
export type MealPrepDiscovery = {
  status: 'available' | 'not_offered' | 'unavailable';
  can_request: false;
  methods: DiscoveryMethod[];
  selection_styles: DiscoveryStyle[];
};
const object = (value: unknown): Record<string, unknown> =>
  value !== null && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : {};

/** Contract v1.2/r5, discovery matrix r3: generic information needs no dated offer,
 * area, location or price. Execution gates remain separate and frozen.
 * Parse methods independently: unrelated invalid/private fields cannot hide a safe method.
 */
export function evaluateMealPrepDiscovery(setup: unknown) {
  const raw = object(setup);
  const methods = object(raw.methods);
  const styles = object(raw.selection_styles);
  const methodStates = discoveryMethods.map((method) => {
    const parsed = methodSchemas[method].safeParse(methods[method]);
    return {
      method,
      state:
        setup == null ? 'disabled' : !parsed.success ? 'unavailable' : parsed.data.enabled ? 'available' : 'disabled',
    } as const;
  });
  const visible = methodStates.filter(({ state }) => state === 'available').map(({ method }) => method);
  const projection: MealPrepDiscovery = {
    status: visible.length
      ? 'available'
      : methodStates.every(({ state }) => state === 'disabled')
        ? 'not_offered'
        : 'unavailable',
    can_request: false,
    methods: visible,
    selection_styles: visible.length ? discoveryStyles.filter((style) => styles[style] === true) : [],
  };
  return { projection, methodStates };
}
