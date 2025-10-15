import type {
  SubscriberArgs,
  SubscriberConfig,
} from "@medusajs/medusa"
import { Modules } from "@medusajs/framework/utils"
import { CreateNotificationDTO } from "@medusajs/types"
import { DateTime } from "luxon"

type EventData = {
  chefEventId: string
  productId: string
}

type ChefEventType = 'cooking_class' | 'plated_dinner' | 'buffet_style'

export default async function chefEventAcceptedHandler({
  event: { data },
  container,
}: SubscriberArgs<EventData>) {
  
  const notificationService = container.resolve(Modules.NOTIFICATION)
  const chefEventService = container.resolve("chefEventModuleService") as any
  const productService = container.resolve("product")

  try {
    // Fetch the chef event data from the database
    const chefEvent = await chefEventService.retrieveChefEvent(data.chefEventId)
    
    if (!chefEvent) {
      console.error("❌ CHEF EVENT ACCEPTED SUBSCRIBER: Chef event not found:", data.chefEventId)
      throw new Error(`Chef event not found: ${data.chefEventId}`)
    }

    // Fetch the created product data
    const product = await productService.retrieveProduct(data.productId)
    
    if (!product) {
      console.error("❌ CHEF EVENT ACCEPTED SUBSCRIBER: Product not found:", data.productId)
      throw new Error(`Product not found: ${data.productId}`)
    }
    
    // Calculate price per person based on event type
    const pricePerPersonMap: Record<ChefEventType, number> = {
      'cooking_class': 119.99,
      'plated_dinner': 149.99,
      'buffet_style': 99.99
    }
    const pricePerPerson = pricePerPersonMap[chefEvent.eventType as ChefEventType] || 119.99
    const totalPrice = pricePerPerson * chefEvent.partySize

    // Format the date and time for display
    const requestedDate = typeof chefEvent.requestedDate === 'string' 
      ? new Date(chefEvent.requestedDate) 
      : chefEvent.requestedDate
    const formattedDate = DateTime.fromJSDate(requestedDate).toFormat('LLL d, yyyy')
    const formattedTime = DateTime.fromFormat(chefEvent.requestedTime, 'HH:mm').toFormat('h:mm a')

    // Get event type label
    const eventTypeMap: Record<ChefEventType, string> = {
      cooking_class: "Chef's Cooking Class",
      plated_dinner: "Plated Dinner Service",
      buffet_style: "Buffet Style Service"
    }

    // Get location type label
    const locationTypeMap: Record<string, string> = {
      customer_location: "at Customer's Location",
      chef_location: "at Chef's Location"
    }

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
        event_type: eventTypeMap[chefEvent.eventType as ChefEventType] || chefEvent.eventType,
        location_type: locationTypeMap[chefEvent.locationType] || chefEvent.locationType,
        location_address: chefEvent.locationAddress || "Not provided",
        party_size: chefEvent.partySize,
        notes: chefEvent.notes || "No special notes provided"
      },
      event: {
        status: "Confirmed",
        total_price: totalPrice.toFixed(2),
        price_per_person: pricePerPerson.toFixed(2)
      },
      product: {
        id: product.id,
        handle: product.handle,
        title: product.title,
        purchase_url: `${process.env.STOREFRONT_URL}/products/${product.handle}`
      },
      chef: {
        name: "Chef Luis Velez",
        email: "support@chefvelez.com",
        phone: "(347) 695-4445"
      }
    }

    // Send acceptance email to customer
    await notificationService.createNotifications({
      to: chefEvent.email,
      channel: "email",
      template: "chef-event-accepted", // Updated template name for Resend
      data: {
        ...emailData,
        emailType: "customer_acceptance",
        requestReference: chefEvent.id.slice(0, 8).toUpperCase(),
        acceptanceDate: DateTime.now().toFormat('LLL d, yyyy'),
        chefNotes: chefEvent.chefNotes || "Looking forward to creating an amazing experience for you!"
      }
    } as CreateNotificationDTO)

    console.log("✅ CHEF EVENT ACCEPTED SUBSCRIBER: Acceptance email sent to customer:", chefEvent.email)

  } catch (error) {
    console.error("❌ CHEF EVENT ACCEPTED SUBSCRIBER: Failed to process event:", error)
    throw error
  }
}

export const config: SubscriberConfig = {
  event: "chef-event.accepted",
} 