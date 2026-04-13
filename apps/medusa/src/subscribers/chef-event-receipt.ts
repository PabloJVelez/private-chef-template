import type { SubscriberArgs, SubscriberConfig } from "@medusajs/medusa"
import { Modules, ContainerRegistrationKeys } from "@medusajs/framework/utils"
import type { CreateNotificationDTO } from "@medusajs/types"
import { DateTime } from "luxon"
import { resolveChefEventTypeEmailLabel } from "../lib/chef-event-email-display"

type EventData = {
  chefEventId: string
  recipients: string[]
  notes?: string
  tipAmount?: number
  tipMethod?: string
}

type ChefEventType = "cooking_class" | "plated_dinner" | "buffet_style"

const LOCATION_TYPE_LABELS: Record<string, string> = {
  customer_location: "at Customer's Location",
  chef_location: "at Chef's Location",
}

const PRICING: Record<ChefEventType, number> = {
  buffet_style: 99.99,
  cooking_class: 119.99,
  plated_dinner: 149.99,
}

export default async function chefEventReceiptHandler({
  event: { data },
  container,
}: SubscriberArgs<EventData>) {
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER)
  logger.info(`Processing receipt send for chef event: ${data.chefEventId}`)

  try {
    const chefEventService = container.resolve("chefEventModuleService") as {
      retrieveChefEvent: (id: string) => Promise<Record<string, unknown>>
    }
    const notificationService = container.resolve(Modules.NOTIFICATION)
    const productService = container.resolve(Modules.PRODUCT)

    const chefEvent = (await chefEventService.retrieveChefEvent(
      data.chefEventId
    )) as Record<string, unknown>
    if (!chefEvent) {
      throw new Error(`Chef event not found: ${data.chefEventId}`)
    }

    const productId = chefEvent.productId as string | undefined
    if (!productId) {
      throw new Error(`Chef event has no product: ${data.chefEventId}`)
    }

    const product = await productService.retrieveProduct(productId)
    if (!product) {
      throw new Error(`Product not found: ${productId}`)
    }

    const eventType = chefEvent.eventType as ChefEventType
    const pricePerPerson = PRICING[eventType] ?? 119.99
    const partySize = Number(chefEvent.partySize ?? 0)
    const fallbackTotal = pricePerPerson * partySize
    const storedTotal = Number(chefEvent.totalPrice)
    const totalPrice = Number.isFinite(storedTotal) && storedTotal > 0 ? storedTotal : fallbackTotal
    const eventTypeLabel = await resolveChefEventTypeEmailLabel(container, chefEvent)

    const requestedDate =
      typeof chefEvent.requestedDate === "string"
        ? new Date(chefEvent.requestedDate)
        : (chefEvent.requestedDate as Date)
    const formattedDate = DateTime.fromJSDate(requestedDate).toFormat("LLL d, yyyy")
    const requestedTime = String(chefEvent.requestedTime ?? "")
    const formattedTime = requestedTime
      ? DateTime.fromFormat(requestedTime, "HH:mm").toFormat("h:mm a")
      : requestedTime

    const emailData = {
      customer: {
        first_name: String(chefEvent.firstName ?? ""),
        last_name: String(chefEvent.lastName ?? ""),
        email: String(chefEvent.email ?? ""),
        phone: String(chefEvent.phone || "Not provided"),
      },
      booking: {
        date: formattedDate,
        time: formattedTime,
        event_type: eventTypeLabel,
        location_type:
          LOCATION_TYPE_LABELS[String(chefEvent.locationType)] || String(chefEvent.locationType),
        location_address: String(chefEvent.locationAddress || "Not provided"),
        party_size: partySize,
        notes: String(chefEvent.notes || "No special notes provided"),
      },
      event: {
        status: String(chefEvent.status ?? "confirmed"),
        total_price: totalPrice.toFixed(2),
        price_per_person: pricePerPerson.toFixed(2),
      },
      product: {
        id: product.id,
        handle: product.handle,
        title: product.title,
        purchase_url: `${process.env.STOREFRONT_URL ?? "http://localhost:3000"}/products/${product.handle}`,
      },
      purchasedTickets: partySize,
      totalPurchasedPrice: totalPrice.toFixed(2),
      tipAmount: data.tipAmount,
      tipMethod: data.tipMethod,
      chef: {
        name: "Chef John Doe",
        email: "support@example.com",
        phone: "(347) 695-4445",
      },
      requestReference: String(chefEvent.id).slice(0, 8).toUpperCase(),
      receiptDate: DateTime.now().toFormat("yyyy-MM-dd"),
      customNotes: data.notes,
    }

    const recipients =
      data.recipients?.length && data.recipients.length > 0
        ? data.recipients
        : [String(chefEvent.email)]

    for (const to of recipients) {
      await notificationService.createNotifications({
        to,
        channel: "email",
        template: "receipt",
        data: emailData,
      } as CreateNotificationDTO)
      logger.info(`Receipt email sent to ${to}`)
    }
  } catch (error) {
    logger.error(
      `Failed to process receipt for ${data.chefEventId}: ${error instanceof Error ? error.message : String(error)}`
    )
    throw error
  }
}

export const config: SubscriberConfig = {
  event: "chef-event.receipt",
}
