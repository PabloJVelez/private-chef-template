import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { CHEF_EVENT_MODULE } from "../../../../modules/chef-event"
import type ChefEventModuleService from "../../../../modules/chef-event/service"
import {
  buildChefEventPaymentSummary,
  normalizeAdditionalCharges,
} from "../../../../lib/chef-event-additional-charges"

export async function GET(
  req: MedusaRequest,
  res: MedusaResponse,
): Promise<void> {
  const { id } = req.params

  try {
    const chefEventService = req.scope.resolve(
      CHEF_EVENT_MODULE,
    ) as ChefEventModuleService

    const chefEvent = await chefEventService.retrieveChefEvent(id)

    if (!chefEvent) {
      res.status(404).json({ message: "Chef event not found" })
      return
    }

    if (chefEvent.status !== "confirmed") {
      res.status(404).json({ message: "Chef event not available" })
      return
    }

    const additionalCharges = normalizeAdditionalCharges(
      (chefEvent as { additionalCharges?: unknown }).additionalCharges,
    )
    const partySize = Number(chefEvent.partySize) || 1
    const totalPriceDollars = Number(chefEvent.totalPrice ?? 0)
    const pricePerTicketDollars =
      partySize > 0 && Number.isFinite(totalPriceDollars)
        ? totalPriceDollars / partySize
        : 0
    const pricePerTicketCents = Math.round(pricePerTicketDollars * 100)
    const paymentSummary = buildChefEventPaymentSummary({
      partySize,
      pricePerTicket: pricePerTicketCents,
      charges: additionalCharges,
    })

    res.status(200).json({
      chefEvent: {
        id: chefEvent.id,
        status: chefEvent.status,
        requestedDate: chefEvent.requestedDate,
        requestedTime: chefEvent.requestedTime,
        partySize: chefEvent.partySize,
        eventType: chefEvent.eventType,
        locationType: chefEvent.locationType,
        locationAddress: chefEvent.locationAddress,
        firstName: chefEvent.firstName,
        lastName: chefEvent.lastName,
        email: chefEvent.email,
        phone: chefEvent.phone,
        notes: chefEvent.notes,
        specialRequirements: chefEvent.specialRequirements,
        totalPrice: chefEvent.totalPrice,
        estimatedDuration: chefEvent.estimatedDuration,
        productId: chefEvent.productId,
        acceptedAt: chefEvent.acceptedAt,
        acceptedBy: chefEvent.acceptedBy,
        chefNotes: chefEvent.chefNotes,
        additionalCharges,
        paymentSummary,
        createdAt: (chefEvent as { created_at?: unknown }).created_at,
        updatedAt: (chefEvent as { updated_at?: unknown }).updated_at,
      },
    })
  } catch (error) {
    console.error("Error retrieving chef event:", error)
    res.status(500).json({ message: "Internal server error" })
  }
}
