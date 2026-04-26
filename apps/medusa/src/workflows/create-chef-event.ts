import { 
  createStep,
  createWorkflow,
  StepResponse,
  WorkflowResponse
} from "@medusajs/workflows-sdk"
import { emitEventStep } from "@medusajs/medusa/core-flows"
import { CHEF_EVENT_MODULE } from "../modules/chef-event"
import { defaultEstimatedDurationMinutes } from "../lib/chef-event-legacy-pricing"
import {
  resolveEventZone,
  wallClockToUtcJsDate,
} from "../lib/chef-event-wall-clock"

type CreateChefEventWorkflowInput = {
  status: 'pending' | 'confirmed' | 'cancelled' | 'completed'
  requestedDate: string
  requestedTime: string
  partySize: number
  eventType: string
  experience_type_id?: string | null
  templateProductId?: string
  locationType: 'customer_location' | 'chef_location'
  locationAddress: string
  firstName: string
  lastName: string
  email: string
  phone?: string
  notes?: string
  totalPrice?: number
  depositPaid?: boolean
  specialRequirements?: string
  estimatedDuration?: number
}

const createChefEventStep = createStep(
  "create-chef-event-step",
  async (input: CreateChefEventWorkflowInput, { container }: { container: any }) => {
    const chefEventModuleService = container.resolve(CHEF_EVENT_MODULE)

    const raw = String(input.requestedDate)
    const datePart = raw.includes("T") ? raw.split("T")[0]! : raw.slice(0, 10)
    const zone = resolveEventZone(
      null,
      undefined,
      process.env.GOOGLE_CALENDAR_DEFAULT_TIMEZONE ?? "America/Chicago",
    )
    const requestedInstant =
      wallClockToUtcJsDate(datePart, input.requestedTime || "12:00", zone) ??
      new Date(input.requestedDate)

    const created = await chefEventModuleService.createChefEvents({
      ...input,
      requestedDate: requestedInstant,
      totalPrice: input.totalPrice || 0,
      depositPaid: input.depositPaid || false,
      estimatedDuration:
        input.estimatedDuration ?? defaultEstimatedDurationMinutes(input.eventType, null),
    })
    const chefEvent = Array.isArray(created) ? created[0] : created

    return new StepResponse(chefEvent)
  }
)

export const createChefEventWorkflow = createWorkflow(
  "create-chef-event-workflow",
  function (input: CreateChefEventWorkflowInput) {
    const chefEvent = createChefEventStep(input)
    
    emitEventStep({
      eventName: "chef-event.requested",
      data: {
        chefEventId: chefEvent.id
      }
    }).config({ name: "emit-chef-event-requested" })

    emitEventStep({
      eventName: "google-calendar.sync-requested",
      data: {
        chefEventId: chefEvent.id,
        operation: "upsert",
      },
    }).config({ name: "emit-google-calendar-sync-requested" })
    
    return new WorkflowResponse({
      chefEvent
    })
  }
) 