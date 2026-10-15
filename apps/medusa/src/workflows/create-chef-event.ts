import { availableSlots, requireSlot } from '../lib/availability/query';
import { createStep, createWorkflow, StepResponse, WorkflowResponse } from '@medusajs/workflows-sdk';
import { emitEventStep } from '@medusajs/medusa/core-flows';
import { CHEF_EVENT_MODULE } from '../modules/chef-event';

type CreateChefEventWorkflowInput = {
  slotStart?: string;
  status: 'pending' | 'confirmed' | 'cancelled' | 'completed';
  requestedDate: string;
  requestedTime: string;
  partySize: number;
  eventType: string;
  experience_type_id?: string | null;
  templateProductId?: string;
  locationType: 'customer_location' | 'chef_location';
  locationAddress: string;
  firstName: string;
  lastName: string;
  email: string;
  phone?: string;
  notes?: string;
  attribution?: Record<string, unknown> | null;
  totalPrice?: number;
  depositPaid?: boolean;
  specialRequirements?: string;
  estimatedDuration?: number;
};

const createChefEventStep = createStep(
  'create-chef-event-step',
  async (input: CreateChefEventWorkflowInput, { container }: { container: any }) => {
    const chefEventModuleService = container.resolve(CHEF_EVENT_MODULE);

    if (input.status !== 'pending') throw new Error('Create a pending request, then use Accept to confirm it.');
    if (!input.experience_type_id) throw new Error('Select an experience before submitting.');
    let canonicalStart = input.slotStart;
    if (!canonicalStart) {
      const candidates = (
        await availableSlots(container, input.requestedDate.slice(0, 10), input.experience_type_id)
      ).slots.filter((s) => s.time === input.requestedTime);
      if (candidates.length !== 1) throw new Error('Select an unambiguous available arrival time before submitting.');
      canonicalStart = candidates[0].start;
    }
    const { slot, timezone, experience } = await requireSlot(
      container,
      input.requestedDate.slice(0, 10),
      input.experience_type_id,
      canonicalStart,
    );
    if (input.requestedTime !== slot.time) throw new Error('Arrival time does not match the selected slot.');
    const { slotStart, ...eventInput } = input;
    const created = await chefEventModuleService.createChefEvents({
      ...eventInput,
      requestedDate: new Date(slot.start),
      timeZone: timezone,
      totalPrice: input.totalPrice || 0,
      depositPaid: input.depositPaid || false,
      estimatedDuration: experience.duration_minutes,
    });
    const chefEvent = Array.isArray(created) ? created[0] : created;

    return new StepResponse(chefEvent);
  },
);

export const createChefEventWorkflow = createWorkflow(
  'create-chef-event-workflow',
  function (input: CreateChefEventWorkflowInput) {
    const chefEvent = createChefEventStep(input);

    emitEventStep({
      eventName: 'chef-event.requested',
      data: {
        chefEventId: chefEvent.id,
      },
    }).config({ name: 'emit-chef-event-requested' });

    emitEventStep({
      eventName: 'google-calendar.sync-requested',
      data: {
        chefEventId: chefEvent.id,
        operation: 'upsert',
      },
    }).config({ name: 'emit-google-calendar-sync-requested' });

    return new WorkflowResponse({
      chefEvent,
    });
  },
);
