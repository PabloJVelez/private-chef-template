import type { MedusaRequest, MedusaResponse } from '@medusajs/framework/http';
import AvailabilityModuleService from '../../../modules/availability/service';
import { availabilitySettingsSchema } from '../../../lib/availability/slots';
import { initialNoticeRules } from '../../../lib/availability/initial-notice';
import { saveAvailabilityWorkflow } from '../../../workflows/save-availability';
export async function GET(req: MedusaRequest, res: MedusaResponse) {
  const [settings] = await req.scope
    .resolve<AvailabilityModuleService>('availability')
    .listAvailabilitySettings({ id: 'chef-default' });
  res.json({
    settings: settings ?? null,
    // Keep the unsaved schedule distinct from first-setup policy defaults.
    ...(!settings ? { initial_notice_rules: await initialNoticeRules(req.scope) } : {}),
  });
}
export async function POST(req: MedusaRequest, res: MedusaResponse) {
  const parsed = availabilitySettingsSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ message: parsed.error.issues.map((i) => i.message).join(' ') });
    return;
  }
  const { result } = await saveAvailabilityWorkflow(req.scope).run({ input: parsed.data });
  res.json({ settings: result });
}
