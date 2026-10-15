import type { MedusaRequest, MedusaResponse } from '@medusajs/framework/http';
import { z } from 'zod';
import { availableSlots } from '../../../lib/availability/query';
const query = z.object({ date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), experience_id: z.string().min(1) });
export async function GET(req: MedusaRequest, res: MedusaResponse) {
  const parsed = query.safeParse(req.query);
  res.setHeader('Cache-Control', 'no-store');
  if (!parsed.success) {
    res.status(400).json({ message: 'Select a date and experience.' });
    return;
  }
  try {
    const { experience, ...result } = await availableSlots(req.scope, parsed.data.date, parsed.data.experience_id);
    res.json(result);
  } catch {
    res
      .status(503)
      .json({ message: 'Availability cannot be checked right now. Please contact the chef or try again.' });
  }
}
