import { 
  createStep,
  createWorkflow,
  StepResponse,
  WorkflowResponse
} from "@medusajs/framework/workflows-sdk"
import { emitEventStep } from "@medusajs/medusa/core-flows"
import { CHEF_EVENT_MODULE } from "../modules/chef-event"
import ChefEventModuleService from "../modules/chef-event/service"
import { Modules } from "@medusajs/framework/utils"

type ResendEventEmailWorkflowInput = {
  chefEventId: string
  recipients: string[]
  notes?: string
  emailType: "event_details_resend" | "custom_message"
}

const updateEmailHistoryStep = createStep(
  "update-email-history-step",
  async (input: ResendEventEmailWorkflowInput, { container }) => {
    const chefEventModuleService: ChefEventModuleService = container.resolve(CHEF_EVENT_MODULE)
    
    // Get current chef event
    const chefEvent = await chefEventModuleService.retrieveChefEvent(input.chefEventId)
    
    // Update email history
    const currentHistory = chefEvent.emailHistory || []
    const newEmailEntry = {
      type: input.emailType,
      recipients: input.recipients,
      notes: input.notes,
      sentAt: new Date().toISOString(),
      sentBy: "chef_admin" // Could be dynamic based on user
    }
    
    const updatedHistory = Array.isArray(currentHistory) ? [...currentHistory, newEmailEntry] : [newEmailEntry]
    
    const updatedChefEvent = await chefEventModuleService.updateChefEvents({
      id: input.chefEventId,
      emailHistory: updatedHistory as any,
      lastEmailSentAt: new Date()
    })
    
    return new StepResponse(updatedChefEvent)
  }
)

export const resendEventEmailWorkflow = createWorkflow(
  "resend-event-email-workflow",
  function (input: ResendEventEmailWorkflowInput) {
    const updatedChefEvent = updateEmailHistoryStep(input)
    
    // Emit event for email notifications
    emitEventStep({
      eventName: "chef-event.email-resend",
      data: {
        chefEventId: input.chefEventId,
        recipients: input.recipients,
        notes: input.notes,
        emailType: input.emailType
      }
    })
    
    return new WorkflowResponse({
      chefEvent: updatedChefEvent,
      emailSent: true
    })
  }
)