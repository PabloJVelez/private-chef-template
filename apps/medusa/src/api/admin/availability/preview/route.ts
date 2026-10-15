import type { MedusaRequest, MedusaResponse } from '@medusajs/framework/http';
import { DateTime } from 'luxon';
import { z } from 'zod';
import { availableSlots } from '../../../../lib/availability/query';
const query = z.object({
  date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .refine((date) => DateTime.fromISO(date).isValid),
  experience_id: z.string().min(1),
});
// /admin routes use Medusa's standard admin authentication.
export async function GET(req: MedusaRequest, res: MedusaResponse) {
  res.setHeader('Cache-Control', 'no-store');
  const parsed = query.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ message: 'Choose a valid date and experience.' });
    return;
  }
  try {
    const result = await availableSlots(req.scope, parsed.data.date, parsed.data.experience_id);
    res.json({
      timezone: result.timezone,
      date: result.date,
      experienceId: result.experienceId,
      slots: result.slots.map(({ start, label }) => ({ start, label })),
    });
  } catch {
    res
      .status(503)
      .json({
        message: 'We could not check arrival times. Check your saved hours and Google connection, then try again.',
      });
  }
}
