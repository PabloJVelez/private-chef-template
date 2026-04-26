import {
  createStep,
  createWorkflow,
  StepResponse,
  WorkflowResponse,
} from "@medusajs/workflows-sdk"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import { CHEF_EVENT_MODULE } from "../modules/chef-event"
import { GOOGLE_CALENDAR_CONNECTION_MODULE } from "../modules/google-calendar-connection"
import type GoogleCalendarConnectionModuleService from "../modules/google-calendar-connection/service"
import { syncChefEventRecord } from "../lib/google-calendar/events"

type DeleteChefEventWorkflowInput = {
  id: string
}

type Logger = {
  info: (msg: string) => void
  warn: (msg: string) => void
  error: (msg: string) => void
}

/**
 * Cancels the linked Google Calendar event (best-effort) and removes the sync
 * map / pending incidents tied to the chef event. Done synchronously before
 * the chef event row is deleted so we never orphan calendar artifacts.
 */
const cancelGoogleArtifactsStep = createStep(
  "cancel-chef-event-google-artifacts-step",
  async (
    input: { id: string },
    { container }: { container: any },
  ) => {
    const logger = container.resolve(ContainerRegistrationKeys.LOGGER) as Logger
    const chefEventService = container.resolve(CHEF_EVENT_MODULE)
    const googleSvc = container.resolve(
      GOOGLE_CALENDAR_CONNECTION_MODULE,
    ) as GoogleCalendarConnectionModuleService

    const chefEvent = await chefEventService.retrieveChefEvent(input.id)
    if (!chefEvent) {
      return new StepResponse({ skipped: true })
    }

    try {
      await syncChefEventRecord(googleSvc, {
        chefEvent: chefEvent as Record<string, unknown>,
        operation: "cancel",
      })
    } catch (error) {
      const message =
        error instanceof Error ? error.message : String(error)
      logger.warn(
        `Google Calendar cancel during chef event deletion failed (${input.id}): ${message}`,
      )
    }

    try {
      await googleSvc.purgeChefEventArtifacts(input.id)
    } catch (error) {
      const message =
        error instanceof Error ? error.message : String(error)
      logger.warn(
        `Failed to purge Google Calendar artifacts for chef event ${input.id}: ${message}`,
      )
    }

    return new StepResponse({ skipped: false })
  },
)

const deleteChefEventStep = createStep(
  "delete-chef-event-step",
  async (
    input: DeleteChefEventWorkflowInput,
    { container }: { container: any },
  ) => {
    const chefEventModuleService = container.resolve(CHEF_EVENT_MODULE)

    const chefEvent = await chefEventModuleService.retrieveChefEvent(input.id)

    if (!chefEvent) {
      throw new Error(`Chef event with id ${input.id} not found`)
    }

    await chefEventModuleService.deleteChefEvents(input.id)

    return new StepResponse({
      id: input.id,
      deleted: true,
    })
  },
)

export const deleteChefEventWorkflow = createWorkflow(
  "delete-chef-event-workflow",
  function (input: DeleteChefEventWorkflowInput) {
    cancelGoogleArtifactsStep({ id: input.id })
    const result = deleteChefEventStep(input)

    return new WorkflowResponse({
      result,
    })
  },
)
