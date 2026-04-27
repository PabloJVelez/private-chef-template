import { 
  createStep,
  createWorkflow,
  StepResponse,
  WorkflowResponse
} from "@medusajs/workflows-sdk"
import { MedusaError } from "@medusajs/framework/utils"
import { emitEventStep } from "@medusajs/medusa/core-flows"
import { CHEF_EVENT_MODULE } from "../modules/chef-event"
import {
  resolveEventZone,
  wallClockToUtcJsDate,
} from "../lib/chef-event-wall-clock"

type UpdateChefEventWorkflowInput = {
  id: string
  status?: 'pending' | 'confirmed' | 'cancelled' | 'completed'
  requestedDate?: string
  requestedTime?: string
  partySize?: number
  eventType?: string
  experience_type_id?: string | null
  templateProductId?: string
  locationType?: 'customer_location' | 'chef_location'
  locationAddress?: string
  firstName?: string
  lastName?: string
  email?: string
  phone?: string
  notes?: string
  totalPrice?: number
  depositPaid?: boolean
  specialRequirements?: string
  estimatedDuration?: number
}

const updateChefEventStep = createStep(
  "update-chef-event-step",
  async (input: UpdateChefEventWorkflowInput, { container }: { container: any }) => {
    const chefEventModuleService = container.resolve(CHEF_EVENT_MODULE)

    const existing = await chefEventModuleService.retrieveChefEvent(input.id)
    if (!existing) {
      throw new MedusaError(
        MedusaError.Types.NOT_FOUND,
        `Chef event with id ${input.id} not found`
      )
    }

    const updateData: any = { ...input }
    if (
      existing.eventMenuId &&
      typeof input.templateProductId === "string" &&
      input.templateProductId !== existing.templateProductId
    ) {
      throw new MedusaError(
        MedusaError.Types.NOT_ALLOWED,
        "Template menu cannot be changed after deriving an event menu"
      )
    }
    if (input.requestedDate) {
      const raw = String(input.requestedDate)
      const datePart = raw.includes("T") ? raw.split("T")[0]! : raw.slice(0, 10)
      const timePart =
        input.requestedTime ??
        (existing as { requestedTime?: string }).requestedTime ??
        "12:00"
      const zone = resolveEventZone(
        null,
        (existing as { timeZone?: string }).timeZone,
        process.env.GOOGLE_CALENDAR_DEFAULT_TIMEZONE ?? "America/Chicago",
      )
      const parsed = wallClockToUtcJsDate(datePart, timePart, zone)
      if (parsed) {
        updateData.requestedDate = parsed
      } else {
        updateData.requestedDate = new Date(input.requestedDate)
      }
    }

    const updated = await chefEventModuleService.updateChefEvents(updateData)
    const chefEvent = Array.isArray(updated) ? updated[0] : updated

    return new StepResponse(chefEvent)
  }
)

export const updateChefEventWorkflow = createWorkflow(
  "update-chef-event-workflow",
  function (input: UpdateChefEventWorkflowInput) {
    const chefEvent = updateChefEventStep(input)

    emitEventStep({
      eventName: "google-calendar.sync-requested",
      data: {
        chefEventId: input.id,
        operation:
          chefEvent.status === "cancelled" ? "cancel" : "upsert",
      },
    }).config({ name: "emit-google-calendar-sync-on-chef-event-update" })
    
    return new WorkflowResponse({
      chefEvent
    })
  }
) 