import { 
  createStep,
  createWorkflow,
  StepResponse,
  WorkflowResponse
} from "@medusajs/workflows-sdk"
import { MENU_MODULE } from "../modules/menu"

type DeleteMenuWorkflowInput = {
  id: string
}

const deleteMenuStep = createStep(
  "delete-menu-step",
  async (input: DeleteMenuWorkflowInput, { container }: { container: any }) => {
    const menuModuleService = container.resolve(MENU_MODULE)
    
    // Check if menu exists
    const menu = await menuModuleService.retrieveMenu(input.id)
    
    if (!menu) {
      throw new Error(`Menu with id ${input.id} not found`)
    }
    
    // Delete the menu (this will cascade to courses, dishes, and ingredients)
    await menuModuleService.deleteMenus([input.id])
    
    return new StepResponse({ 
      id: input.id,
      deleted: true 
    })
  }
)

export const deleteMenuWorkflow = createWorkflow(
  "delete-menu-workflow",
  function (input: DeleteMenuWorkflowInput) {
    const result = deleteMenuStep(input)
    
    return new WorkflowResponse({
      result
    })
  }
) 