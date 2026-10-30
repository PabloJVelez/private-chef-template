import type { AuthenticatedMedusaRequest, MedusaResponse } from '@medusajs/framework/http';
import { z } from 'zod';
import type SharedSchedulingService from '../../../../modules/shared-scheduling/service';
import { availabilityAdmin } from '../route';

const bounds = z
  .object({ start: z.string().datetime({ offset: true }), end: z.string().datetime({ offset: true }) })
  .strict()
  .refine(
    (v) =>
      Date.parse(v.end) > Date.parse(v.start) && Date.parse(v.end) - Date.parse(v.start) <= 31 * 86400000,
    'Choose a review interval of at most 31 days.',
  ); // Query bound, not a booking/recurrence horizon.
export async function GET(req: AuthenticatedMedusaRequest, res: MedusaResponse) {
  if (!availabilityAdmin(req, res)) return;
  const parsed = bounds.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ message: 'Invalid work review interval.' });
    return;
  }
  const blocks = await req.scope
    .resolve<SharedSchedulingService>('sharedScheduling')
    .reviewWorkBlocks(parsed.data);
  res.json({ blocks, order_serving_totals: null });
}
