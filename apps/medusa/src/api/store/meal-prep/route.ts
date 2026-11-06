import type { MedusaRequest, MedusaResponse } from '@medusajs/framework/http';
import type AvailabilityModuleService from '../../../modules/availability/service';
import { evaluateMealPrepDiscovery } from '../../../lib/meal-prep-discovery';

export async function GET(req: MedusaRequest, res: MedusaResponse) {
  res.setHeader('Cache-Control', 'no-store');
  try {
    // A single committed row read; no initialization writes or multi-query assembly.
    const [settings] = await req.scope
      .resolve<AvailabilityModuleService>('availability')
      .listAvailabilitySettings({ id: 'chef-default' });
    res.json(evaluateMealPrepDiscovery(settings?.meal_prep).projection);
  } catch {
    res
      .status(503)
      .json({ message: 'Meal Prep information is temporarily unavailable. Please try again.', retryable: true });
  }
}
