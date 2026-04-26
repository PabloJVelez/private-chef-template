import { 
  createStep,
  createWorkflow,
  StepResponse,
  WorkflowResponse
} from "@medusajs/workflows-sdk"
import { MENU_MODULE } from "../modules/menu"
import { DEFAULT_MENU_STATUS, type MenuStatus } from "../modules/menu/constants"

type CreateMenuWorkflowInput = {
  name: string
  status?: MenuStatus
  courses?: Array<{
    name: string
    dishes: Array<{
      name: string
      description?: string
      ingredients: Array<{
        name: string
        optional?: boolean
      }>
    }>
  }>
  images?: string[]
  thumbnail?: string | null
  image_files?: { url: string; file_id?: string }[]
}

const createMenuStep = createStep(
  "create-menu-step",
  async (input: CreateMenuWorkflowInput, { container }: { container: any }) => {
    const menuModuleService = container.resolve(MENU_MODULE)
    
    // Create the menu first
    const menu = await menuModuleService.createMenus({
      name: input.name,
      status: input.status ?? DEFAULT_MENU_STATUS,
    })
    
    const courses = []
    
    if (input.courses && input.courses.length > 0) {
      for (const courseData of input.courses) {
        const course = await menuModuleService.createCourses({
          name: courseData.name,
          menu_id: menu.id
        })
        
        const dishes = []
        for (const dishData of courseData.dishes) {
          const dish = await menuModuleService.createDishes({
            name: dishData.name,
            description: dishData.description,
            course_id: course.id
          })
          
          const ingredients = []
          for (const ingredientData of dishData.ingredients) {
            const ingredient = await menuModuleService.createIngredients({
              name: ingredientData.name,
              optional: ingredientData.optional ?? false,
              dish_id: dish.id
            })
            ingredients.push(ingredient)
          }
          
          dishes.push({ ...dish, ingredients })
        }
        
        courses.push({ ...course, dishes })
      }
    }
    
    // Attach images if provided
    if (input.images && input.images.length > 0) {
      const fileMap: Record<string, string | undefined> = {}
      if (input.image_files) {
        for (const f of input.image_files) {
          fileMap[f.url] = f.file_id
        }
      }
      // Use the service to replace images and set thumbnail
      await menuModuleService.replaceMenuImages(menu.id, input.images, {
        thumbnail: input.thumbnail,
        fileMap,
      })
    } else if (input.thumbnail === null) {
      // Explicitly clear thumbnail if requested and no images
      await menuModuleService.updateMenus({ id: menu.id, thumbnail: null as any })
    }

    const fullMenu = await menuModuleService.retrieveMenu(menu.id, {
      relations: ["courses", "courses.dishes", "courses.dishes.ingredients", "images"],
    })
    
    return new StepResponse(fullMenu)
  }
)

export const createMenuWorkflow = createWorkflow(
  "create-menu-workflow", 
  function (input: CreateMenuWorkflowInput) {
    const menu = createMenuStep(input)
    
    return new WorkflowResponse({
      menu
    })
  }
) 