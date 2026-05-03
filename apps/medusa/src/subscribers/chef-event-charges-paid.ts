import type { SubscriberArgs, SubscriberConfig } from "@medusajs/medusa"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import { CHEF_EVENT_MODULE } from "../modules/chef-event"
import type ChefEventModuleService from "../modules/chef-event/service"

const CHARGE_LINE_KIND = "chef_event_additional_charge"

type OrderPlacedPayload = {
  id: string
}

type OrderItemSnapshot = {
  metadata?: Record<string, unknown> | null
}

type OrderRow = {
  id: string
  items?: OrderItemSnapshot[] | null
}

export default async function chefEventChargesPaidHandler({
  event,
  container,
}: SubscriberArgs<OrderPlacedPayload>) {
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER)
  const query = container.resolve(ContainerRegistrationKeys.QUERY)
  const chefEventService = container.resolve(
    CHEF_EVENT_MODULE,
  ) as ChefEventModuleService

  const orderId = event.data?.id
  if (!orderId) {
    return
  }

  try {
    const { data } = (await query.graph({
      entity: "order",
      fields: ["id", "items.id", "items.metadata"],
      filters: { id: orderId },
    })) as { data?: OrderRow[] }

    const order = data?.[0]
    if (!order) {
      return
    }

    const grouped = new Map<
      string,
      Array<{ chargeId: string; orderId: string }>
    >()

    for (const item of order.items ?? []) {
      const metadata = (item.metadata ?? {}) as Record<string, unknown>
      if (metadata.kind !== CHARGE_LINE_KIND) {
        continue
      }
      const eventId =
        typeof metadata.chef_event_id === "string"
          ? metadata.chef_event_id
          : null
      const chargeId =
        typeof metadata.chef_event_charge_id === "string"
          ? metadata.chef_event_charge_id
          : null
      if (!eventId || !chargeId) {
        continue
      }
      const list = grouped.get(eventId) ?? []
      list.push({ chargeId, orderId: order.id })
      grouped.set(eventId, list)
    }

    for (const [eventId, rows] of grouped.entries()) {
      await chefEventService.markChargesPaidByOrder(eventId, rows)
    }
  } catch (error) {
    logger.warn(
      `[chef-event-charges-paid] order ${orderId}: ${
        error instanceof Error ? error.message : String(error)
      }`,
    )
  }
}

export const config: SubscriberConfig = {
  event: "order.placed",
}
