import type { AuthenticatedMedusaRequest, MedusaResponse } from '@medusajs/framework/http';
import AvailabilityModuleService from '../../../modules/availability/service';
import { availabilitySettingsSchema } from '../../../lib/availability/slots';
import { initialNoticeRules } from '../../../lib/availability/initial-notice';
import { saveAvailabilityWorkflow } from '../../../workflows/save-availability';
// Single-chef admin authority follows existing Availability. Never accept chef/resource IDs from JSON.
export function availabilityAdmin(req: AuthenticatedMedusaRequest, res: MedusaResponse): boolean {
  if (req.auth_context?.actor_type !== 'user' || !req.auth_context.actor_id) {
    res.status(401).json({ message: 'An authenticated admin is required.' });
    return false;
  }
  return true;
}
export async function GET(req: AuthenticatedMedusaRequest, res: MedusaResponse) {
  if (!availabilityAdmin(req, res)) return;
  const [settings] = await req.scope
    .resolve<AvailabilityModuleService>('availability')
    .listAvailabilitySettings({ id: 'chef-default' });
  res.json({
    settings: settings ?? null,
    // Keep the unsaved schedule distinct from first-setup policy defaults.
    ...(!settings ? { initial_notice_rules: await initialNoticeRules(req.scope) } : {}),
  });
}
export async function POST(req: AuthenticatedMedusaRequest, res: MedusaResponse) {
  if (!availabilityAdmin(req, res)) return;
  const parsed = availabilitySettingsSchema
    .extend({ version: availabilitySettingsSchema.shape.version.unwrap() })
    .strict()
    .safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ message: parsed.error.issues.map((i) => i.message).join(' ') });
    return;
  }
  const { result, errors } = await saveAvailabilityWorkflow(req.scope).run({
    input: parsed.data,
    throwOnError: false,
  });
  if (errors.length) {
    const error = errors[0].error;
    if ((error as { type?: string }).type === 'conflict') {
      res.status(409).json({ message: error.message });
      return;
    }
    throw error;
  }
  res.json({ settings: result });
}
