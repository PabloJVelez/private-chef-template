import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { z } from "zod"
import { MENU_MODULE } from "../../../../modules/menu"
import { updateMenuWorkflow } from "../../../../workflows/update-menu"
import { deleteMenuWorkflow } from "../../../../workflows/delete-menu"

// Validation schemas
const imageUrlsSchema = z.array(z.string().url()).optional()
const imageFilesSchema = z.array(z.object({
  url: z.string().url(),
  file_id: z.string().optional(),
})).optional()

const updateMenuSchema = z.object({
  name: z.string().min(1, "Menu name is required").optional(),
  courses: z.array(z.object({
    id: z.string().optional(),
    name: z.string().min(1, "Course name is required"),
    dishes: z.array(z.object({
      id: z.string().optional(),
      name: z.string().min(1, "Dish name is required"),
      description: z.string().optional(),
      ingredients: z.array(z.object({
        id: z.string().optional(),
        name: z.string().min(1, "Ingredient name is required"),
        optional: z.boolean().optional()
      }))
    }))
  })).optional(),
  images: imageUrlsSchema,
  thumbnail: z.string().url().nullable().optional(),
  image_files: imageFilesSchema,
})

export async function GET(
  req: MedusaRequest,
  res: MedusaResponse
): Promise<void> {
  const logger = req.scope.resolve("logger")
  
  try {
    const { id } = req.params
    const menuModuleService = req.scope.resolve(MENU_MODULE) as any

    const menu = await menuModuleService.retrieveMenu(id, {
      relations: ["courses", "courses.dishes", "courses.dishes.ingredients", "images"]
    })

    if (!menu) {
      res.status(404).json({
        message: "Menu not found"
      })
      return
    }

    res.status(200).json(menu)
  } catch (error) {
    logger.error(`Error retrieving menu: ${error instanceof Error ? error.message : String(error)}`)
    res.status(500).json({
      message: "Internal server error",
      error: error instanceof Error ? error.message : "Unknown error"
    })
  }
}

export async function POST(
  req: MedusaRequest,
  res: MedusaResponse
): Promise<void> {
  const logger = req.scope.resolve("logger")
  
  try {
    const { id } = req.params
    const validatedData = updateMenuSchema.parse(req.body)
    
    // Check if menu exists first
    const menuModuleService = req.scope.resolve(MENU_MODULE) as any
    const existingMenu = await menuModuleService.retrieveMenu(id)
    
    if (!existingMenu) {
      res.status(404).json({
        message: "Menu not found"
      })
      return
    }

    const { result } = await updateMenuWorkflow(req.scope).run({
      input: {
        id,
        ...validatedData
      }
    })

    res.status(200).json(result.menu)
  } catch (error) {
    logger.error(`Error updating menu: ${error instanceof Error ? error.message : String(error)}`)
    
    if (error instanceof z.ZodError) {
      res.status(400).json({
        message: "Validation error",
        errors: error.errors
      })
      return
    }
    
    res.status(500).json({
      message: "Internal server error",
      error: error instanceof Error ? error.message : "Unknown error"
    })
  }
}

export async function DELETE(
  req: MedusaRequest,
  res: MedusaResponse
): Promise<void> {
  const logger = req.scope.resolve("logger")
  
  try {
    const { id } = req.params
    
    await deleteMenuWorkflow(req.scope).run({
      input: { id }
    })

    res.status(204).send()
  } catch (error) {
    logger.error(`Error deleting menu: ${error instanceof Error ? error.message : String(error)}`)
    
    if (error instanceof Error && error.message.includes("not found")) {
      res.status(404).json({
        message: "Menu not found"
      })
      return
    }
    
    res.status(500).json({
      message: "Internal server error",
      error: error instanceof Error ? error.message : "Unknown error"
    })
  }
} 