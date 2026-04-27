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

type CreateOrGetChefEventMenuInput = {
  chefEventId: string
}

/**
 * Creates an event-owned menu draft from templateProductId on first run and
 * reuses that same draft on subsequent runs. This keeps template menus
 * immutable from event context while preserving idempotency.
 */
const createOrGetChefEventMenuStep = createStep(
  "create-or-get-chef-event-menu-step",
  async (
    input: CreateOrGetChefEventMenuInput,
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

    if (!chefEvent.templateProductId) {
      throw new MedusaError(
        MedusaError.Types.INVALID_DATA,
        "Chef event does not have a template menu selected"
      )
    }

    if (chefEvent.eventMenuId) {
      const menu = await menuModuleService.retrieveMenu(chefEvent.eventMenuId, {
        relations: [
          "courses",
          "courses.dishes",
          "courses.dishes.ingredients",
          "images",
          "menu_experience_prices",
        ],
      })

      return new StepResponse({
        chefEvent,
        menu,
        created: false,
      })
    }

    const duplicatedMenu = await menuModuleService.duplicateMenu(chefEvent.templateProductId)

    let updated
    try {
      updated = await chefEventModuleService.updateChefEvents({
        id: chefEvent.id,
        eventMenuId: duplicatedMenu.id,
      })
    } catch (error) {
      await menuModuleService.deleteMenus([duplicatedMenu.id])
      throw new MedusaError(
        MedusaError.Types.UNEXPECTED_STATE,
        `Failed to link derived menu to chef event ${chefEvent.id}: ${
          error instanceof Error ? error.message : String(error)
        }`
      )
    }

    const updatedChefEvent = Array.isArray(updated) ? updated[0] : updated

    return new StepResponse({
      chefEvent: updatedChefEvent,
      menu: duplicatedMenu,
      created: true,
    })
  }
)

export const createOrGetChefEventMenuWorkflow = createWorkflow(
  "create-or-get-chef-event-menu-workflow",
  function (input: CreateOrGetChefEventMenuInput) {
    const result = createOrGetChefEventMenuStep(input)

    return new WorkflowResponse(result)
  }
)
