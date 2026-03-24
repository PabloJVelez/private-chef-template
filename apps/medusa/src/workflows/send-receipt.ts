import {
  createStep,
  createWorkflow,
  StepResponse,
  WorkflowResponse,
} from "@medusajs/workflows-sdk"
import { emitEventStep } from "@medusajs/medusa/core-flows"
import { CHEF_EVENT_MODULE } from "../modules/chef-event"
import ChefEventModuleService from "../modules/chef-event/service"

export type SendReceiptWorkflowInput = {
  chefEventId: string
  recipients?: string[]
  notes?: string
  tipAmount?: number
  tipMethod?: string
}

const updateReceiptHistoryAndTipStep = createStep(
  "update-receipt-history-and-tip-step",
  async (input: SendReceiptWorkflowInput, { container }) => {
    const chefEventModuleService: ChefEventModuleService =
      container.resolve(CHEF_EVENT_MODULE)

    const chefEvent = await chefEventModuleService.retrieveChefEvent(
      input.chefEventId
    )
    if (!chefEvent) {
      throw new Error(`Chef event not found: ${input.chefEventId}`)
    }

    const recipients =
      input.recipients?.length && input.recipients.length > 0
        ? input.recipients
        : [chefEvent.email]

    const currentHistory = chefEvent.emailHistory || []
    const newEntry = {
      type: "receipt",
      recipients,
      notes: input.notes,
      sentAt: new Date().toISOString(),
      sentBy: "chef_admin",
    }
    const updatedHistory = Array.isArray(currentHistory)
      ? [...currentHistory, newEntry]
      : [newEntry]

    const updatePayload: {
      id: string
      emailHistory: unknown
      lastEmailSentAt: Date
      tipAmount?: number | null
      tipMethod?: string | null
    } = {
      id: input.chefEventId,
      emailHistory: updatedHistory,
      lastEmailSentAt: new Date(),
    }
    if (input.tipAmount != null) {
      updatePayload.tipAmount = input.tipAmount
    }
    if (input.tipMethod != null) {
      updatePayload.tipMethod = input.tipMethod
    }

    const updatedChefEvent = await chefEventModuleService.updateChefEvents({
      ...updatePayload,
      emailHistory: updatePayload.emailHistory as never,
    })

    return new StepResponse({
      updatedChefEvent,
      recipients,
      notes: input.notes,
      tipAmount: input.tipAmount,
      tipMethod: input.tipMethod,
    })
  }
)

export const sendReceiptWorkflow = createWorkflow(
  "send-receipt-workflow",
  function (input: SendReceiptWorkflowInput) {
    const stepResult = updateReceiptHistoryAndTipStep(input)

    emitEventStep({
      eventName: "chef-event.receipt",
      data: {
        chefEventId: input.chefEventId,
        recipients: stepResult.recipients,
        notes: stepResult.notes,
        tipAmount: stepResult.tipAmount,
        tipMethod: stepResult.tipMethod,
      },
    })

    return new WorkflowResponse({
      chefEvent: stepResult.updatedChefEvent,
      emailSent: true,
    })
  }
)
