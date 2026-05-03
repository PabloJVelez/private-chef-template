import { MedusaError } from "@medusajs/framework/utils"
import { addToCartWorkflow } from "@medusajs/core-flows"
import { getSystemChargeVariantId } from "../../lib/system-charge-variant"

const CHARGE_LINE_KIND = "chef_event_additional_charge"

type IncomingItem = {
  variant_id?: string | null
  quantity?: number
  metadata?: Record<string, unknown> | null
}

type ExistingItem = {
  variant_sku?: string | null
  metadata?: Record<string, unknown> | null
}

addToCartWorkflow.hooks.validate(async ({ input, cart }, { container }) => {
  const incomingItems = (
    (input as { items?: IncomingItem[] | null })?.items ?? []
  ).filter((item): item is IncomingItem => !!item)
  if (incomingItems.length === 0) {
    return
  }

  const existingItems = (
    (cart as { items?: ExistingItem[] | null })?.items ?? []
  ).filter((item): item is ExistingItem => !!item)

  const existingEventIds = new Set<string>()
  for (const item of existingItems) {
    const metadata = (item.metadata ?? {}) as Record<string, unknown>
    const eventId =
      typeof metadata.chef_event_id === "string"
        ? metadata.chef_event_id
        : null
    const isEventTicket =
      typeof item.variant_sku === "string" &&
      item.variant_sku.startsWith("EVENT-")
    if (isEventTicket && eventId) {
      existingEventIds.add(eventId)
      continue
    }
    if (metadata.kind === CHARGE_LINE_KIND && eventId) {
      existingEventIds.add(eventId)
    }
  }

  // Resolve once per validate call; downstream guards still apply per-item.
  const systemChargeVariantId = await getSystemChargeVariantId(container)

  for (const item of incomingItems) {
    const metadata = (item.metadata ?? {}) as Record<string, unknown>
    const isChargeLine =
      metadata.kind === CHARGE_LINE_KIND ||
      (systemChargeVariantId !== null &&
        item.variant_id === systemChargeVariantId)

    if (isChargeLine) {
      if (item.variant_id !== systemChargeVariantId) {
        throw new MedusaError(
          MedusaError.Types.NOT_ALLOWED,
          "Additional charge lines must use the system charge variant",
        )
      }
      if (
        metadata.kind !== CHARGE_LINE_KIND ||
        metadata.via_event_checkout !== true
      ) {
        throw new MedusaError(
          MedusaError.Types.NOT_ALLOWED,
          "Additional charge lines can only be added through event checkout initialization",
        )
      }
      if (item.quantity !== 1) {
        throw new MedusaError(
          MedusaError.Types.NOT_ALLOWED,
          "Additional charge quantity must always be 1",
        )
      }
    }

    const incomingEventId =
      typeof metadata.chef_event_id === "string"
        ? metadata.chef_event_id
        : null
    if (existingEventIds.size === 0) {
      continue
    }
    if (!incomingEventId) {
      throw new MedusaError(
        MedusaError.Types.NOT_ALLOWED,
        "Event checkout carts cannot be mixed with regular products",
      )
    }
    const [existingEventId] = Array.from(existingEventIds)
    if (incomingEventId !== existingEventId) {
      throw new MedusaError(
        MedusaError.Types.NOT_ALLOWED,
        "Only one chef event can exist in a cart at a time",
      )
    }
  }
})
