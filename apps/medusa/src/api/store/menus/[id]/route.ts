import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { MENU_MODULE } from "../../../../modules/menu"

export async function GET(
  req: MedusaRequest,
  res: MedusaResponse
): Promise<void> {
  const logger = req.scope.resolve("logger")
  
  try {
    const { id } = req.params
    const menuModuleService = req.scope.resolve(MENU_MODULE) as any
    
    const menu = await menuModuleService.retrieveMenu(id, {
      relations: ["courses", "courses.dishes", "courses.dishes.ingredients", "images", "menu_experience_prices"]
    })

    if (!menu) {
      res.status(404).json({
        message: "Menu not found"
      })
      return
    }

    res.status(200).json({
      menu
    })
  } catch (error) {
    logger.error(`Error retrieving store menu: ${error instanceof Error ? error.message : String(error)}`)
    res.status(500).json({
      message: "Internal server error",
      error: error instanceof Error ? error.message : "Unknown error"
    })
  }
} 