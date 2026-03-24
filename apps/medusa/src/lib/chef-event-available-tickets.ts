import { Modules } from "@medusajs/framework/utils"
import type { MedusaContainer } from "@medusajs/framework/types"

/**
 * Sums (stocked_quantity - reserved_quantity) for all variants of a product
 * at the "Digital Location" stock location — same place accept-chef-event uses.
 */
export async function getAvailableTicketsForProduct(
  container: MedusaContainer,
  productId: string
): Promise<number> {
  const stockLocationModuleService = container.resolve(Modules.STOCK_LOCATION)
  const productModuleService = container.resolve(Modules.PRODUCT)
  const inventoryModuleService = container.resolve(Modules.INVENTORY)

  const digitalLocations = await stockLocationModuleService.listStockLocations({
    name: "Digital Location",
  })
  if (!digitalLocations?.length) {
    return 0
  }
  const locationId = digitalLocations[0].id

  const product = await productModuleService.retrieveProduct(productId, {
    relations: ["variants"],
  })
  const variants = product?.variants
  if (!variants?.length) {
    return 0
  }

  let total = 0
  for (const variant of variants) {
    const sku = variant.sku
    if (!sku) {
      continue
    }
    const items = await inventoryModuleService.listInventoryItems({ sku })
    if (!items.length) {
      continue
    }
    const inventoryItem = items[0]
    const levels = await inventoryModuleService.listInventoryLevels({
      inventory_item_id: inventoryItem.id,
      location_id: locationId,
    })
    for (const level of levels) {
      const stocked = Number(level.stocked_quantity ?? 0)
      const reserved = Number(level.reserved_quantity ?? 0)
      total += Math.max(0, stocked - reserved)
    }
  }

  return total
}
