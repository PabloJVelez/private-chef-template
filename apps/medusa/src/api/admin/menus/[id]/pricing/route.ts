import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { z } from "zod"
import { MENU_MODULE } from "../../../../../modules/menu"

const upsertPricingSchema = z.object({
  prices: z.array(
    z.object({
      experience_type_id: z.string().min(1),
      price_per_person: z.number().int().min(0),
    })
  ),
  allow_tbd_pricing: z.boolean().optional().default(false),
})

export async function GET(
  req: MedusaRequest,
  res: MedusaResponse
): Promise<void> {
  const { id } = req.params
  const menuModuleService = req.scope.resolve(MENU_MODULE) as any

  const menu = await menuModuleService.retrieveMenu(id)
  const prices = await menuModuleService.listMenuExperiencePrices(
    { menu_id: id },
    { order: { created_at: "ASC" } }
  )

  res.status(200).json({
    prices,
    allow_tbd_pricing: Boolean((menu as { allow_tbd_pricing?: boolean }).allow_tbd_pricing),
  })
}

export async function POST(
  req: MedusaRequest,
  res: MedusaResponse
): Promise<void> {
  const logger = req.scope.resolve("logger")
  const { id: menuId } = req.params

  try {
    const { prices, allow_tbd_pricing: allowTbdPricing } = upsertPricingSchema.parse(req.body)
    const menuModuleService = req.scope.resolve(MENU_MODULE) as any

    // Verify menu exists
    await menuModuleService.retrieveMenu(menuId)

    const hasPositivePrice = prices.some((p) => p.price_per_person > 0)
    if (!allowTbdPricing && !hasPositivePrice) {
      res.status(400).json({
        message:
          "Add a per-person price for at least one experience, or enable \"allow requests without listed prices\" to save.",
        code: "MENU_PRICING_REQUIRES_PRICE_OR_TBD",
      })
      return
    }

    const existing = await menuModuleService.listMenuExperiencePrices({ menu_id: menuId })
    const existingMap = new Map(
      existing.map((p: any) => [p.experience_type_id, p])
    )

    const incomingIds = new Set(prices.map((p) => p.experience_type_id))

    // Delete rows no longer present
    for (const ex of existing) {
      if (!incomingIds.has(ex.experience_type_id)) {
        await menuModuleService.deleteMenuExperiencePrices(ex.id)
      }
    }

    // Upsert rows
    for (const row of prices) {
      const prev = existingMap.get(row.experience_type_id) as any
      if (prev) {
        await menuModuleService.updateMenuExperiencePrices({
          id: prev.id,
          price_per_person: row.price_per_person,
        })
      } else {
        await menuModuleService.createMenuExperiencePrices({
          menu_id: menuId,
          experience_type_id: row.experience_type_id,
          price_per_person: row.price_per_person,
        })
      }
    }

    await menuModuleService.updateMenus({
      id: menuId,
      allow_tbd_pricing: allowTbdPricing,
    })

    const updated = await menuModuleService.listMenuExperiencePrices(
      { menu_id: menuId },
      { order: { created_at: "ASC" } }
    )

    res.status(200).json({
      prices: updated,
      allow_tbd_pricing: allowTbdPricing,
    })
  } catch (error) {
    logger.error(
      `Error upserting menu pricing: ${error instanceof Error ? error.message : String(error)}`
    )

    if (error instanceof z.ZodError) {
      res.status(400).json({ message: "Validation error", errors: error.errors })
      return
    }

    res.status(500).json({
      message: "Internal server error",
      error: error instanceof Error ? error.message : "Unknown error",
    })
  }
}
