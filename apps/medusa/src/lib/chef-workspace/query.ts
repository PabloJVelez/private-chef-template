import { z } from 'zod';
import { MedusaError } from '@medusajs/framework/utils';

const status = z.enum(['pending', 'confirmed', 'cancelled', 'completed']);
const filters = z.object({
  q: z.string().trim().max(200).optional(),
  status: z.union([status, z.literal('all')]).optional(),
  statuses: z.preprocess((v) => {
    const parts = typeof v === 'string' ? [v] : v;
    if (!Array.isArray(parts) || !parts.every((part) => typeof part === 'string')) return v;
    return [
      ...new Set(
        parts.flatMap((part) =>
          part
            .split(',')
            .map((value) => value.trim())
            .filter(Boolean),
        ),
      ),
    ];
  }, z.array(status).max(4).optional()),
  eventType: z.string().max(200).optional(),
  locationType: z.enum(['customer_location', 'chef_location', 'all']).optional(),
});
const integerQuery = z.union([z.string().regex(/^\d+$/).transform(Number), z.number()]);
export const requestQuery = filters.extend({
  limit: integerQuery.pipe(z.number().int().min(1).max(100)).default(20),
  offset: integerQuery.pipe(z.number().int().min(0).max(1000000)).default(0),
});
export const calendarQuery = filters
  .extend({
    start: z.string().datetime({ offset: true }),
    end: z.string().datetime({ offset: true }),
  })
  .refine(
    (v) => Date.parse(v.end) > Date.parse(v.start) && Date.parse(v.end) - Date.parse(v.start) <= 62 * 86400000,
    'Calendar range must be ordered and no longer than 62 days.',
  );
export function parseQuery<T extends z.ZodTypeAny>(schema: T, input: unknown): z.output<T> {
  const result = schema.safeParse(input);
  if (!result.success) throw new MedusaError(MedusaError.Types.INVALID_DATA, result.error.message);
  return result.data;
}
export function eventFilters(input: z.infer<typeof filters>): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  if (input.statuses?.length) result.status = { $in: input.statuses };
  else if (input.status && input.status !== 'all') result.status = input.status;
  if (input.eventType && input.eventType !== 'all') result.eventType = input.eventType;
  if (input.locationType && input.locationType !== 'all') result.locationType = input.locationType;
  // Explicit fields: the native model has no searchable-property metadata for `q`.
  if (input.q)
    result.$or = ['firstName', 'lastName', 'eventType'].map((field) => ({
      [field]: { $ilike: `%${input.q!.replace(/[\\%_]/g, '\\$&')}%` },
    }));
  return result;
}
