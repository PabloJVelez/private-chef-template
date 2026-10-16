import type { MedusaRequest, MedusaResponse } from '@medusajs/framework/http';
import { z } from 'zod';
import { availableCalendar } from '../../../../lib/availability/query';
const query = z.object({
  experience_id: z.string().min(1),
  month: z
    .string()
    .regex(/^\d{4}-(0[1-9]|1[0-2])$/)
    .optional(),
});
export async function GET(req: MedusaRequest, res: MedusaResponse) {
  res.setHeader('Cache-Control', 'no-store');
  const parsed = query.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ message: 'Choose an experience and a valid month.' });
    return;
  }
  try {
    res.json(await availableCalendar(req.scope, parsed.data.experience_id, parsed.data.month));
  } catch {
    res.status(503).json({ message: 'The calendar could not be checked. Please retry or contact the chef.' });
  }
}
