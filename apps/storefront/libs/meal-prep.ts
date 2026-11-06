// Public wire contract. Unknown fields are never forwarded into loader data.
export const methodCopy = {
  in_home: { name: 'In-home cooking', description: 'Meal preparation in your home kitchen.' },
  delivery: { name: 'Delivery', description: 'Prepared meals with delivery as a service option.' },
  pickup: { name: 'Pickup', description: 'Prepared meals with pickup as a service option.' },
} as const;
export const styleCopy = {
  individual_dishes: 'Individual dishes and quantities',
  package: 'Packages',
  chosen_menu: 'Chosen-menu visit',
  tailored_plan: 'Tailored-plan request',
} as const;
export type MealPrepDiscovery = {
  status: 'available' | 'not_offered' | 'unavailable';
  can_request: false;
  methods: (keyof typeof methodCopy)[];
  selection_styles: (keyof typeof styleCopy)[];
};
export type MealPrepRead = { ok: true; discovery: MealPrepDiscovery } | { ok: false };
export function parseMealPrep(value: unknown): MealPrepDiscovery {
  const v = value as MealPrepDiscovery;
  if (
    !v ||
    !['available', 'not_offered', 'unavailable'].includes(v.status) ||
    v.can_request !== false ||
    !Array.isArray(v.methods) ||
    !v.methods.every((key) => typeof key === 'string' && Object.prototype.hasOwnProperty.call(methodCopy, key)) ||
    !Array.isArray(v.selection_styles) ||
    !v.selection_styles.every(
      (key) => typeof key === 'string' && Object.prototype.hasOwnProperty.call(styleCopy, key),
    ) ||
    (v.status === 'available') !== v.methods.length > 0 ||
    (v.status !== 'available' && v.selection_styles.length > 0)
  )
    throw new Error('Invalid Meal Prep response');
  return {
    status: v.status,
    can_request: false,
    methods: [...new Set(v.methods)],
    selection_styles: [...new Set(v.selection_styles)],
  };
}
