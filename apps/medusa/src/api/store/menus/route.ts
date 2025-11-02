import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { z } from "zod"
import { MENU_MODULE } from "../../../modules/menu"

// Validation schema for store menu listing
const listStoreMenusSchema = z.object({
  limit: z.string().transform(val => parseInt(val)).optional().default("20"),
  offset: z.string().transform(val => parseInt(val)).optional().default("0"),
  q: z.string().optional()
})

export async function GET(
  req: MedusaRequest,
  res: MedusaResponse
): Promise<void> {
  const logger = req.scope.resolve("logger")
  
  try {
    const query = listStoreMenusSchema.parse(req.query)
    const menuModuleService = req.scope.resolve(MENU_MODULE) as any
    
    const [menus, count] = await menuModuleService.listAndCountMenus(
      {
        ...(query.q ? {
          name: {
            $ilike: `%${query.q}%`
          }
        } : {})
      },
      {
        take: query.limit,
        skip: query.offset,
        relations: ["courses", "courses.dishes", "courses.dishes.ingredients", "images"]
      }
    )

    // Set cache headers for 30 minutes as specified in the plan
    res.setHeader('Cache-Control', 'public, max-age=60, s-maxage=300')
    
    res.status(200).json({
      menus,
      count,
      offset: query.offset,
      limit: query.limit
    })
  } catch (error) {
    logger.error(`Error listing store menus: ${error instanceof Error ? error.message : String(error)}`)
    res.status(500).json({
      message: "Internal server error",
      error: error instanceof Error ? error.message : "Unknown error"
    })
  }
} 