import {
  createStep,
  createWorkflow,
  StepResponse,
  WorkflowResponse,
} from "@medusajs/workflows-sdk"
import { CHEF_EVENT_MODULE } from "../modules/chef-event"
import { MENU_MODULE } from "../modules/menu"

type RevertChefEventMenuInput = {
  chefEventId: string
  deleteDerivedMenu?: boolean
}

const revertChefEventMenuStep = createStep(
  "revert-chef-event-menu-step",
  async (
    input: RevertChefEventMenuInput,
    { container }: { container: any }
  ) => {
    const chefEventModuleService = container.resolve(CHEF_EVENT_MODULE)
    const menuModuleService = container.resolve(MENU_MODULE)

    const chefEvent = await chefEventModuleService.retrieveChefEvent(input.chefEventId)

    if (!chefEvent) {
      throw new Error(`Chef event with id ${input.chefEventId} not found`)
    }

    if (!chefEvent.eventMenuId) {
      throw new Error("Chef event does not have a derived menu")
    }

    const derivedMenuId = chefEvent.eventMenuId

    const updated = await chefEventModuleService.updateChefEvents({
      id: chefEvent.id,
      eventMenuId: null,
    })
    const updatedChefEvent = Array.isArray(updated) ? updated[0] : updated

    if (input.deleteDerivedMenu) {
      await menuModuleService.deleteMenus(derivedMenuId)
    }

    return new StepResponse({
      chefEvent: updatedChefEvent,
      deletedDerivedMenu: Boolean(input.deleteDerivedMenu),
      derivedMenuId,
    })
  }
)

export const revertChefEventMenuWorkflow = createWorkflow(
  "revert-chef-event-menu-workflow",
  function (input: RevertChefEventMenuInput) {
    const result = revertChefEventMenuStep(input)

    return new WorkflowResponse(result)
  }
)
