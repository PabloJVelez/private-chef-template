import {
  createStep,
  createWorkflow,
  StepResponse,
  WorkflowResponse,
} from '@medusajs/framework/workflows-sdk';
import { confirmScheduleEdit } from '../lib/private-event-schedule/command';
import type { ScheduleEditInput } from '../modules/chef-event/schedule-edit';

const edit = createStep(
  'edit-pending-event-schedule',
  async (input: ScheduleEditInput, { container }) =>
    new StepResponse(await confirmScheduleEdit(container, input)),
);

// No compensation: a later transport/provider failure must not undo a committed event edit.
export const editPendingEventScheduleWorkflow = createWorkflow(
  {
    name: 'edit-pending-event-schedule',
    store: true,
    idempotent: true,
    retentionTime: 30 * 86400,
  },
  (input: ScheduleEditInput) => new WorkflowResponse(edit(input)),
);
