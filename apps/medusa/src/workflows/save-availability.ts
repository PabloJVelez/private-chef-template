import { createStep, createWorkflow, StepResponse, WorkflowResponse } from '@medusajs/framework/workflows-sdk';
import { initialNoticeRules } from '../lib/availability/initial-notice';
import AvailabilityModuleService from '../modules/availability/service';
import { availabilitySettingsSchema, type Settings } from '../lib/availability/slots';
const save = createStep('save-chef-availability', async (input: Settings, { container }) => {
  const values = availabilitySettingsSchema.parse(input);
  const service = container.resolve<AvailabilityModuleService>('availability');
  // Older API clients can omit rules on first save. Preserve legacy policy then;
  // an explicit [] remains an intentional removal, and saved schedules never
  // fall back to experience fields (including saved null/disabled rules).
  if (values.notice_rules == null) {
    const [existing] = await service.listAvailabilitySettings({ id: 'chef-default' });
    if (!existing) values.notice_rules = await initialNoticeRules(container);
  }
  const result = await service.saveSchedule(values);
  return new StepResponse(result);
});
export const saveAvailabilityWorkflow = createWorkflow(
  'save-chef-availability-settings',
  (input: Settings) => new WorkflowResponse(save(input)),
);
