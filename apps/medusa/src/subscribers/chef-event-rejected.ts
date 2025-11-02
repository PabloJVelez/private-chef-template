import type {
  SubscriberArgs,
  SubscriberConfig,
} from "@medusajs/medusa"
import { Modules, ContainerRegistrationKeys } from "@medusajs/framework/utils"
import { CreateNotificationDTO } from "@medusajs/types"
import { DateTime } from "luxon"

type EventData = {
  chefEventId: string
  rejectionReason: string
}

type ChefEventType = 'cooking_class' | 'plated_dinner' | 'buffet_style'

export default async function chefEventRejectedHandler({
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
      rejection: {
        reason: data.rejectionReason,
        chefNotes: chefEvent.chefNotes || "We apologize for any inconvenience this may cause."
      },
      chef: {
        name: "Chef Luis Velez",
        email: "support@chefvelez.com",
        phone: "(347) 695-4445"
      }
    }

    // Send rejection email to customer
    await notificationService.createNotifications({
      to: chefEvent.email,
      channel: "email",
      template: "chef-event-rejected", // Updated template name for Resend
      data: {
        ...emailData,
        emailType: "customer_rejection",
        requestReference: chefEvent.id.slice(0, 8).toUpperCase(),
        rejectionDate: DateTime.now().toFormat('LLL d, yyyy')
      }
    } as CreateNotificationDTO)

    logger.info(`Rejection email sent to customer: ${chefEvent.email}`)

  } catch (error) {
    logger.error(`Failed to process chef event rejection for ${data.chefEventId}: ${error instanceof Error ? error.message : String(error)}`)
    throw error
  }
}

export const config: SubscriberConfig = {
  event: "chef-event.rejected",
} 