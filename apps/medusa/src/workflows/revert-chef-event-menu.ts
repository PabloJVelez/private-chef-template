import {
  createStep,
  createWorkflow,
  StepResponse,
  WorkflowResponse,
} from "@medusajs/workflows-sdk"
import { MedusaError } from "@medusajs/framework/utils"
import { CHEF_EVENT_MODULE } from "../modules/chef-event"
import { MENU_MODULE } from "../modules/menu"
import ChefEventModuleService from "../modules/chef-event/service"
import MenuModuleService from "../modules/menu/service"

type RevertChefEventMenuInput = {
  chefEventId: string
  deleteDerivedMenu?: boolean
}

/**
 * Reverts event context back to the initial template pointer by clearing
 * eventMenuId, with optional cleanup of the derived event-owned menu.
 */
const revertChefEventMenuStep = createStep(
  "revert-chef-event-menu-step",
  async (
    input: RevertChefEventMenuInput,
    { container }: { container: any }
  ) => {
    const chefEventModuleService: ChefEventModuleService =
      container.resolve(CHEF_EVENT_MODULE)
    const menuModuleService: MenuModuleService = container.resolve(MENU_MODULE)

    const chefEvent = await chefEventModuleService.retrieveChefEvent(input.chefEventId)

    if (!chefEvent) {
      throw new MedusaError(
        MedusaError.Types.NOT_FOUND,
        `Chef event with id ${input.chefEventId} not found`
      )
    }

    if (!chefEvent.eventMenuId) {
      throw new MedusaError(
        MedusaError.Types.INVALID_DATA,
        "Chef event does not have a derived menu"
      )
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
