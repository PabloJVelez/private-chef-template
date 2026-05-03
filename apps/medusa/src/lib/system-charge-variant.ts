import type { MedusaContainer } from "@medusajs/framework/types"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"

export const SYSTEM_CHARGE_PRODUCT_HANDLE = "system-chef-event-charge"
export const SYSTEM_CHARGE_VARIANT_SKU = "SYS-CHEF-CHARGE"

type QueryClient = {
  graph: (input: {
    entity: string
    fields: string[]
    filters?: Record<string, unknown>
  }) => Promise<{ data?: Array<Record<string, unknown>> }>
}

export async function getSystemChargeVariantId(
  container: MedusaContainer,
): Promise<string | null> {
  if (process.env.SYSTEM_CHARGE_VARIANT_ID) {
    return process.env.SYSTEM_CHARGE_VARIANT_ID
  }

  const query = container.resolve(ContainerRegistrationKeys.QUERY) as QueryClient
  const { data } = await query.graph({
    entity: "product_variant",
    fields: ["id"],
    filters: {
      sku: SYSTEM_CHARGE_VARIANT_SKU,
    },
  })

  const variantId = data?.[0]?.id
  return typeof variantId === "string" ? variantId : null
}
