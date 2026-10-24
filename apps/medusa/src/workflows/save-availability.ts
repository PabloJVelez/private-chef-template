import { createStep, createWorkflow, StepResponse, WorkflowResponse } from '@medusajs/framework/workflows-sdk';
import AvailabilityModuleService from '../modules/availability/service';
import { availabilitySettingsSchema, type Settings } from '../lib/availability/slots';
const save = createStep('save-chef-availability', async (input: Settings, { container }) => {
  const values = availabilitySettingsSchema.parse(input);
  const service = container.resolve<AvailabilityModuleService>('availability');
  const result = await service.saveSchedule(values);
  return new StepResponse(result);
});
export const saveAvailabilityWorkflow = createWorkflow(
  'save-chef-availability-settings',
  (input: Settings) => new WorkflowResponse(save(input)),
);
