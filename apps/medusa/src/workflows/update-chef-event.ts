import { 
  createStep,
  createWorkflow,
  StepResponse,
  WorkflowResponse
} from "@medusajs/workflows-sdk"
import { CHEF_EVENT_MODULE } from "../modules/chef-event"

type UpdateChefEventWorkflowInput = {
  id: string
  status?: 'pending' | 'confirmed' | 'cancelled' | 'completed'
  requestedDate?: string
  requestedTime?: string
  partySize?: number
  eventType?: 'cooking_class' | 'plated_dinner' | 'buffet_style'
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
    
    const updateData: any = { ...input }
    if (input.requestedDate) {
      updateData.requestedDate = new Date(input.requestedDate)
    }
    
    const chefEvent = await chefEventModuleService.updateChefEvents(updateData)
    
    return new StepResponse(chefEvent)
  }
)

export const updateChefEventWorkflow = createWorkflow(
  "update-chef-event-workflow",
  function (input: UpdateChefEventWorkflowInput) {
    const chefEvent = updateChefEventStep(input)
    
    return new WorkflowResponse({
      chefEvent
    })
  }
) 