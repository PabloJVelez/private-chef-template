import {
  createStep,
  createWorkflow,
  StepResponse,
  WorkflowResponse,
} from "@medusajs/workflows-sdk"
import { MENU_MODULE } from "../modules/menu"
import MenuModuleService from "../modules/menu/service"

type DuplicateMenuWorkflowInput = {
  id: string
  name?: string
}

const duplicateMenuStep = createStep(
  "duplicate-menu-step",
  async (
    input: DuplicateMenuWorkflowInput,
    { container }: { container: any }
  ) => {
    const menuModuleService: MenuModuleService = container.resolve(MENU_MODULE)

    const menu = await menuModuleService.duplicateMenu(input.id, input.name)
    return new StepResponse(menu)
  }
)

export const duplicateMenuWorkflow = createWorkflow(
  "duplicate-menu-workflow",
  function (input: DuplicateMenuWorkflowInput) {
    const menu = duplicateMenuStep(input)

    return new WorkflowResponse({
      menu,
    })
  }
)
