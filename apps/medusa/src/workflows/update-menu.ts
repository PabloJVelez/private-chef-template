import { 
  createStep,
  createWorkflow,
  StepResponse,
  WorkflowResponse
} from "@medusajs/workflows-sdk"
import { MENU_MODULE } from "../modules/menu"
import MenuModuleService from "src/modules/menu/service"
import type { MenuStatus } from "../modules/menu/constants"

type UpdateMenuWorkflowInput = {
  id: string
  name?: string
  status?: MenuStatus
  images?: string[]
  thumbnail?: string | null
  image_files?: { url: string; file_id?: string }[]
  courses?: Array<{
    id?: string
    name: string
    dishes: Array<{
      id?: string
      name: string
      description?: string
      ingredients: Array<{
        id?: string
        name: string
        optional?: boolean
      }>
    }>
  }>
}

const updateMenuStep = createStep(
  "update-menu-step",
  async (input: UpdateMenuWorkflowInput, { container }: { container: any }) => {
    const menuModuleService: MenuModuleService = container.resolve(MENU_MODULE)
    
    const menuUpdateData: Record<string, unknown> = {
      id: input.id,
    }

    if (input.name !== undefined) {
      menuUpdateData.name = input.name
    }

    if (input.status !== undefined) {
      menuUpdateData.status = input.status
    }

    // Update the menu
    const menu = await menuModuleService.updateMenus(menuUpdateData)
    
    // If courses are provided, handle the full replacement
    if (input.courses !== undefined) {
      // Get existing courses to clean up
      const existingCourses = await menuModuleService.listCourses({
        menu_id: input.id
      })
      
      // Delete existing courses (this will cascade to dishes and ingredients)
      for (const course of existingCourses) {
        await menuModuleService.deleteCourses(course.id)
      }
      
      // Create new courses
      const courses = []
      for (const courseData of input.courses) {
        const course = await menuModuleService.createCourses({
          name: courseData.name,
          menu_id: input.id
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
      
      // After handling courses, optionally replace images
      if (input.images !== undefined) {
        const fileMap: Record<string, string | undefined> = {}
        if (input.image_files) {
          for (const f of input.image_files) {
            fileMap[f.url] = f.file_id
          }
        }
        await menuModuleService.replaceMenuImages(input.id, input.images, {
          thumbnail: input.thumbnail,
          fileMap,
        })
      } else if (input.thumbnail !== undefined) {
        await menuModuleService.updateMenus({ id: input.id, thumbnail: input.thumbnail as any })
      }

      const reloaded = await menuModuleService.retrieveMenu(input.id, { relations: ["courses", "courses.dishes", "courses.dishes.ingredients", "images"] })
      return new StepResponse(reloaded)
    }
    
    // If only images/thumbnail are being updated
    if (input.images !== undefined || input.thumbnail !== undefined) {
      if (input.images !== undefined) {
        const fileMap: Record<string, string | undefined> = {}
        if (input.image_files) {
          for (const f of input.image_files) fileMap[f.url] = f.file_id
        }
        await menuModuleService.replaceMenuImages(input.id, input.images ?? [], {
          thumbnail: input.thumbnail,
          fileMap,
        })
      } else if (input.thumbnail !== undefined) {
        await menuModuleService.updateMenus({ id: input.id, thumbnail: input.thumbnail as any })
      }
      const reloaded = await menuModuleService.retrieveMenu(input.id, { relations: ["courses", "courses.dishes", "courses.dishes.ingredients", "images"] })
      return new StepResponse(reloaded)
    }

    return new StepResponse(menu)
  }
)

export const updateMenuWorkflow = createWorkflow(
  "update-menu-workflow",
  function (input: UpdateMenuWorkflowInput) {
    const menu = updateMenuStep(input)
    
    return new WorkflowResponse({
      menu
    })
  }
) 