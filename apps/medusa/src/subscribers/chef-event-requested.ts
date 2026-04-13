import type {
  SubscriberArgs,
  SubscriberConfig,
} from "@medusajs/medusa"
import { Modules, ContainerRegistrationKeys } from "@medusajs/framework/utils"
import { CreateNotificationDTO } from "@medusajs/types"
import { DateTime } from "luxon"
import { resolveChefEventTypeEmailLabel } from "../lib/chef-event-email-display"

type EventData = {
  chefEventId: string
}

export default async function chefEventRequestedHandler({
  event: { data },
  container,
}: SubscriberArgs<EventData>) {
  
  const notificationService = container.resolve(Modules.NOTIFICATION)
  const chefEventService = container.resolve("chefEventModuleService") as any
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER)

  try {
    // Fetch the chef event data from the database
    const chefEvent = await chefEventService.retrieveChefEvent(data.chefEventId)
    
    if (!chefEvent) {
      logger.error(`Chef event not found: ${data.chefEventId}`)
      throw new Error(`Chef event not found: ${data.chefEventId}`)
    }
    
    const pricePerPersonMap = {
      cooking_class: 119.99,
      plated_dinner: 149.99,
      buffet_style: 99.99,
    }
    const pricePerPerson =
      pricePerPersonMap[chefEvent.eventType as keyof typeof pricePerPersonMap] || 119.99
    const fallbackTotal = pricePerPerson * chefEvent.partySize
    const storedTotal = Number(chefEvent.totalPrice)
    const totalPrice = Number.isFinite(storedTotal) && storedTotal > 0 ? storedTotal : fallbackTotal

    const eventTypeLabel = await resolveChefEventTypeEmailLabel(container, chefEvent as Record<string, unknown>)

    // Format the date and time for display
    const requestedDate = typeof chefEvent.requestedDate === 'string' 
      ? new Date(chefEvent.requestedDate) 
      : chefEvent.requestedDate
    const formattedDate = DateTime.fromJSDate(requestedDate).toFormat('LLL d, yyyy')
    const formattedTime = DateTime.fromFormat(chefEvent.requestedTime, 'HH:mm').toFormat('h:mm a')

    // Get location type label
    const locationTypeMap: Record<string, string> = {
      customer_location: "at Customer's Location",
      chef_location: "at Chef's Location"
    }

    // Get template product info (default to custom if not found)
    const templateProduct = {
      id: chefEvent.templateProductId || "custom",
      title: chefEvent.templateProductId ? "Custom Menu" : "Custom Menu"
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
        menu: templateProduct.title,
        event_type: eventTypeLabel,
        location_type: locationTypeMap[chefEvent.locationType] || chefEvent.locationType,
        location_address: chefEvent.locationAddress || "Not provided",
        party_size: chefEvent.partySize,
        notes: chefEvent.notes || "No special notes provided"
      },
      event: {
        status: "Pending",
        total_price: totalPrice.toFixed(2),
        conflict: false
      },
      acceptUrl: `${process.env.ADMIN_BACKEND_URL}/app/chef-events/${chefEvent.id}`,
      rejectUrl: `${process.env.ADMIN_BACKEND_URL}/app/chef-events/${chefEvent.id}`
    }

    // Send confirmation email to customer
    await notificationService.createNotifications({
      to: chefEvent.email,
      channel: "email",
      template: "chef-event-requested", // Updated template name for Resend
              data: {
          ...emailData,
          emailType: "customer_confirmation",
        requestReference: chefEvent.id.slice(0, 8).toUpperCase(),
        chefContact: {
          email: "support@example.com",
          phone: "(347) 695-4445"
        }
      }
    } as CreateNotificationDTO)

    // Send notification emails to all chefs in the list
    const chefEmails = process.env.CHEF_NOTIFICATIONS_LIST?.split(',').map(email => email.trim()).filter(Boolean) || []
    
    if (chefEmails.length === 0) {
      logger.warn("No chef emails configured in CHEF_NOTIFICATIONS_LIST")
    } else {
      // Send individual notifications to each chef
      const chefNotifications = chefEmails.map(email => ({
        to: email,
        channel: "email" as const,
        template: "chef-event-requested",
        data: {
          ...emailData,
          emailType: "chef_notification",
          requestReference: chefEvent.id.slice(0, 8).toUpperCase(),
          chefContact: {
            email: "support@example.com",
            phone: "(347) 695-4445"
          }
        }
      } as CreateNotificationDTO))

      // Send all notifications
      await Promise.all(
        chefNotifications.map(notification => 
          notificationService.createNotifications(notification)
        )
      )
      
      logger.info(`Sent chef event notifications to ${chefEmails.length} chef(s): ${chefEmails.join(', ')}`)
    }

  } catch (error) {
    logger.error(`Failed to process chef event request for ${data.chefEventId}: ${error instanceof Error ? error.message : String(error)}`)
    throw error
  }
}

export const config: SubscriberConfig = {
  event: "chef-event.requested",
} 