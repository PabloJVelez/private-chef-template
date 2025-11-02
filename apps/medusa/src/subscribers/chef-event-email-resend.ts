import type { SubscriberArgs, SubscriberConfig } from "@medusajs/framework"
import { CHEF_EVENT_MODULE } from "../modules/chef-event"
import { Modules, ContainerRegistrationKeys } from "@medusajs/framework/utils"
import { DateTime } from "luxon"

type EventData = {
  chefEventId: string
  recipients: string[]
  notes?: string
  emailType: "event_details_resend" | "custom_message"
}

export default async function chefEventEmailResendHandler({
  event: { data },
  container,
}: SubscriberArgs<EventData>) {
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER)
  
  logger.info(`Processing email resend request for chef event: ${data.chefEventId}`)

  try {
    const chefEventModuleService = container.resolve(CHEF_EVENT_MODULE) as any
    const notificationService = container.resolve(Modules.NOTIFICATION)

    // Get chef event details
    const chefEvent = await chefEventModuleService.retrieveChefEvent(data.chefEventId)
    
    if (!chefEvent) {
      throw new Error(`Chef event not found: ${data.chefEventId}`)
    }

    // Get product details if event is confirmed
    let product = null
    if (chefEvent.productId) {
      const productModuleService = container.resolve(Modules.PRODUCT)
      product = await productModuleService.retrieveProduct(chefEvent.productId)
    }

    // Format data for email template
    const formattedDate = DateTime.fromJSDate(chefEvent.requestedDate).toFormat('LLL d, yyyy')
    const formattedTime = chefEvent.requestedTime

    const eventTypeMap: Record<string, string> = {
      cooking_class: "Cooking Class",
      plated_dinner: "Plated Dinner",
      buffet_style: "Buffet Style"
    }

    const locationTypeMap: Record<string, string> = {
      customer_location: "at Customer's Location",
      chef_location: "at Chef's Location"
    }

    // Calculate pricing
    const PRICING_STRUCTURE = {
      buffet_style: 99.99,
      cooking_class: 119.99,
      plated_dinner: 149.99
    }
    
    const pricePerPerson = PRICING_STRUCTURE[chefEvent.eventType as keyof typeof PRICING_STRUCTURE]
    const totalPrice = pricePerPerson * chefEvent.partySize

    // Common email data
    const emailData = {
      customer: {
        first_name: chefEvent.firstName,
        last_name: chefEvent.lastName,
        email: chefEvent.email,
        phone: chefEvent.phone || "Not provided"
      },
      booking: {
        date: formattedDate,
        time: formattedTime,
        event_type: eventTypeMap[chefEvent.eventType] || chefEvent.eventType,
        location_type: locationTypeMap[chefEvent.locationType] || chefEvent.locationType,
        location_address: chefEvent.locationAddress || "Not provided",
        party_size: chefEvent.partySize,
        notes: chefEvent.notes || "No special notes provided"
      },
      event: {
        status: chefEvent.status,
        total_price: totalPrice.toFixed(2),
        price_per_person: pricePerPerson.toFixed(2)
      },
      product: product ? {
        id: product.id,
        handle: product.handle,
        title: product.title,
        purchase_url: `${process.env.STOREFRONT_URL || 'http://localhost:3000'}/products/${product.handle}`
      } : null,
      chef: {
        name: "Chef Luis Velez",
        email: "support@chefvelez.com",
        phone: "(347) 695-4445"
      },
      requestReference: chefEvent.id.slice(0, 8).toUpperCase(),
      customNotes: data.notes,
      emailType: data.emailType
    }

    // Send emails to all recipients
    for (const recipient of data.recipients) {
      await notificationService.createNotifications({
        to: recipient,
        channel: "email",
        template: "event-details-resend",
        data: emailData
      })
      
      logger.info(`Email sent to ${recipient}`)
    }

  } catch (error) {
    logger.error(`Failed to process email resend for ${data.chefEventId}: ${error instanceof Error ? error.message : String(error)}`)
    throw error
  }
}

export const config: SubscriberConfig = {
  event: "chef-event.email-resend",
}