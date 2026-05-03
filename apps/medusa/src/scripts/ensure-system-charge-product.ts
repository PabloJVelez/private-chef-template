import type { ExecArgs } from "@medusajs/types"
import {
  createProductsWorkflow,
  linkSalesChannelsToStockLocationWorkflow,
} from "@medusajs/medusa/core-flows"
import { ContainerRegistrationKeys, Modules } from "@medusajs/framework/utils"
import {
  SYSTEM_CHARGE_PRODUCT_HANDLE,
  SYSTEM_CHARGE_VARIANT_SKU,
} from "../lib/system-charge-variant"
import { getDigitalStockLocationId } from "../lib/digital-stock-location"

type QueryClient = {
  graph: (input: {
    entity: string
    fields: string[]
    filters?: Record<string, unknown>
  }) => Promise<{ data?: Array<Record<string, unknown>> }>
}

export default async function ensureSystemChargeProduct({
  container,
}: Pick<ExecArgs, "container">) {
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER)
  const query = container.resolve(ContainerRegistrationKeys.QUERY) as QueryClient
  const remoteLink = container.resolve(ContainerRegistrationKeys.LINK)
  const storeModule = container.resolve(Modules.STORE)
  const productModule = container.resolve(Modules.PRODUCT)
  const inventoryModule = container.resolve(Modules.INVENTORY)

  const [store] = await storeModule.listStores()
  if (!store?.default_sales_channel_id) {
    throw new Error(
      "Store default sales channel is missing. Run init first.",
    )
  }

  const { data: shippingProfiles } = await query.graph({
    entity: "shipping_profile",
    fields: ["id"],
    filters: {
      type: "digital",
    },
  })
  const digitalShippingProfileId = shippingProfiles?.[0]?.id
  if (typeof digitalShippingProfileId !== "string") {
    throw new Error(
      "Digital shipping profile not found. Run init first.",
    )
  }

  const digitalLocationId = await getDigitalStockLocationId(container)
  if (!digitalLocationId) {
    throw new Error(
      'Digital stock location "Digital Location" not found. Run init (or accept-chef-event prerequisites) first.',
    )
  }

  try {
    await linkSalesChannelsToStockLocationWorkflow(container).run({
      input: {
        id: digitalLocationId,
        add: [store.default_sales_channel_id],
      },
    })
  } catch (e) {
    logger.warn(
      `[ensure-system-charge-product] Sales channel ↔ digital location link may already exist: ${
        e instanceof Error ? e.message : String(e)
      }`,
    )
  }

  const { data: existingVariantRows } = await query.graph({
    entity: "product_variant",
    fields: ["id", "sku", "product.id", "manage_inventory"],
    filters: {
      sku: SYSTEM_CHARGE_VARIANT_SKU,
    },
  })
  let variant = existingVariantRows?.[0] as
    | {
        id?: string
        sku?: string
        product?: { id?: string }
        manage_inventory?: boolean
      }
    | undefined

  if (!variant?.id) {
    const existingProducts = await productModule.listProducts({
      handle: SYSTEM_CHARGE_PRODUCT_HANDLE,
    })

    if (existingProducts.length > 0) {
      const orphanId = String(existingProducts[0].id)
      logger.warn(
        `[ensure-system-charge-product] Found product handle ${SYSTEM_CHARGE_PRODUCT_HANDLE} but missing SKU ${SYSTEM_CHARGE_VARIANT_SKU}. Deleting incomplete product ${orphanId} and recreating.`,
      )
      await productModule.deleteProducts([orphanId])
    }

    await createProductsWorkflow(container).run({
      input: {
        products: [
          {
            title: "System - Chef Event Additional Charge",
            handle: SYSTEM_CHARGE_PRODUCT_HANDLE,
            status: "published",
            description:
              "Internal system product used to represent one-time chef event additional charges.",
            shipping_profile_id: digitalShippingProfileId,
            sales_channels: [{ id: store.default_sales_channel_id }],
            metadata: {
              is_system_product: true,
              kind: "chef_event_additional_charge",
            },
            options: [
              {
                title: "Charge Type",
                values: ["System Charge"],
              },
            ],
            variants: [
              {
                title: "System Charge",
                sku: SYSTEM_CHARGE_VARIANT_SKU,
                manage_inventory: true,
                options: {
                  "Charge Type": "System Charge",
                },
                prices: [
                  {
                    currency_code: "usd",
                    amount: 0,
                  },
                ],
              },
            ],
          },
        ],
      },
    })

    const { data: createdRows } = await query.graph({
      entity: "product_variant",
      fields: ["id", "sku", "product.id", "manage_inventory"],
      filters: {
        sku: SYSTEM_CHARGE_VARIANT_SKU,
      },
    })
    variant = createdRows?.[0] as typeof variant
  }

  if (!variant?.id || !variant?.sku) {
    throw new Error(
      "System charge variant was not created successfully.",
    )
  }

  if (variant.manage_inventory !== true) {
    await productModule.updateProductVariants(String(variant.id), {
      manage_inventory: true,
    })
  }

  const sku = String(variant.sku)
  let inventoryItem = (await inventoryModule.listInventoryItems({ sku }))[0]

  if (!inventoryItem) {
    inventoryItem = await inventoryModule.createInventoryItems({
      sku,
      origin_country: "US",
      hs_code: "",
      mid_code: "",
      material: "",
      weight: 0,
      length: 0,
      height: 0,
      width: 0,
      requires_shipping: false,
      description: "System charge line item inventory",
      title: "System Charge",
    })
  }

  if (inventoryItem.requires_shipping !== false) {
    inventoryItem = await inventoryModule.updateInventoryItems({
      id: inventoryItem.id,
      requires_shipping: false,
    })
  }

  const existingLevels = await inventoryModule.listInventoryLevels({
    inventory_item_id: inventoryItem.id,
    location_id: digitalLocationId,
  })

  if (existingLevels.length === 0) {
    await inventoryModule.createInventoryLevels({
      inventory_item_id: inventoryItem.id,
      location_id: digitalLocationId,
      stocked_quantity: 1_000_000,
    })
  }

  const { data: variantInventoryRows } = await query.graph({
    entity: "product_variant",
    fields: ["id", "inventory_items.inventory_item_id"],
    filters: {
      id: String(variant.id),
    },
  })

  const linkedInventoryItemIds = Array.isArray(
    variantInventoryRows?.[0]?.inventory_items,
  )
    ? (
        variantInventoryRows?.[0]?.inventory_items as Array<{
          inventory_item_id?: string
        }>
      )
        .map((entry) => entry.inventory_item_id)
        .filter((id): id is string => typeof id === "string")
    : []

  if (!linkedInventoryItemIds.includes(String(inventoryItem.id))) {
    await remoteLink.create([
      {
        [Modules.PRODUCT]: { variant_id: String(variant.id) },
        [Modules.INVENTORY]: { inventory_item_id: String(inventoryItem.id) },
        data: { required_quantity: 1 },
      },
    ])
  }

  const productId =
    variant.product?.id != null ? String(variant.product.id) : "unknown"

  logger.info(
    `[ensure-system-charge-product] Ready: product ${productId}, variant ${String(variant.id)}, inventory ${String(inventoryItem.id)} @ ${digitalLocationId}.`,
  )
}
