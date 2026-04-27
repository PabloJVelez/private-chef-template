import {
  createStep,
  createWorkflow,
  StepResponse,
  WorkflowResponse,
} from "@medusajs/workflows-sdk"
import { CHEF_EVENT_MODULE } from "../modules/chef-event"
import { MENU_MODULE } from "../modules/menu"

type CreateOrGetChefEventMenuInput = {
  chefEventId: string
}

const createOrGetChefEventMenuStep = createStep(
  "create-or-get-chef-event-menu-step",
  async (
    input: CreateOrGetChefEventMenuInput,
    { container }: { container: any }
  ) => {
    const chefEventModuleService = container.resolve(CHEF_EVENT_MODULE)
    const menuModuleService = container.resolve(MENU_MODULE)

    const chefEvent = await chefEventModuleService.retrieveChefEvent(input.chefEventId)

    if (!chefEvent) {
      throw new Error(`Chef event with id ${input.chefEventId} not found`)
    }

    if (!chefEvent.templateProductId) {
      throw new Error("Chef event does not have a template menu selected")
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
    const updated = await chefEventModuleService.updateChefEvents({
      id: chefEvent.id,
      eventMenuId: duplicatedMenu.id,
    })
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
