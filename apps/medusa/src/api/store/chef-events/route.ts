import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { z } from "zod"
import { createChefEventWorkflow } from "../../../workflows/create-chef-event"
import { EXPERIENCE_TYPE_MODULE } from "../../../modules/experience-type"
import { MENU_MODULE } from "../../../modules/menu"
import type ExperienceTypeModuleService from "../../../modules/experience-type/service"
import { fallbackPricePerPersonFromStrings } from "../../../lib/chef-event-legacy-pricing"

const createStoreChefEventSchema = z.object({
  requestedDate: z.string().min(1, "Requested date is required"),
  requestedTime: z.string().regex(/^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/, "Invalid time format"),
  partySize: z.number().min(2, "Minimum party size is 2").max(50, "Maximum party size is 50"),
  eventType: z.string().min(1, "Event type is required"),
  experience_type_id: z.string().optional(),
  templateProductId: z.string().optional(),
  locationType: z.enum(['customer_location', 'chef_location']),
  locationAddress: z.string().min(3, "Address must be at least 3 characters"),
  firstName: z.string().min(1, "First name is required"),
  lastName: z.string().min(1, "Last name is required"),
  email: z.string().email("Valid email is required"),
  phone: z.string().optional(),
  notes: z.string().optional(),
  specialRequirements: z.string().optional()
})

export async function POST(
  req: MedusaRequest,
  res: MedusaResponse
): Promise<void> {
  const logger = req.scope.resolve("logger")

  try {
    const validatedData = createStoreChefEventSchema.parse(req.body)

    let eventType = validatedData.eventType.trim()
    let experienceTypeId: string | null = validatedData.experience_type_id?.trim() || null
    let experienceSlug: string | null = null
    let pricePerPerson: number | null = null

    if (experienceTypeId) {
      try {
        const experienceTypeSvc = req.scope.resolve(EXPERIENCE_TYPE_MODULE) as ExperienceTypeModuleService
        const experienceType = await experienceTypeSvc.retrieveExperienceType(experienceTypeId)
        eventType = experienceType.name
        experienceSlug = experienceType.slug ?? null
      } catch {
        logger.warn(`Experience type ${experienceTypeId} not found, using provided eventType`)
        experienceTypeId = null
        experienceSlug = null
      }
    }

    const menuId = validatedData.templateProductId?.trim() || null

    // Menu + experience: matrix is authoritative — no legacy/catalog fallback (avoids wrong totals).
    if (menuId && experienceTypeId) {
      try {
        const menuModuleService = req.scope.resolve(MENU_MODULE) as any
        const prices = await menuModuleService.listMenuExperiencePrices({
          menu_id: menuId,
          experience_type_id: experienceTypeId,
        })
        if (prices.length > 0) {
          const cents = Number(prices[0].price_per_person)
          if (Number.isFinite(cents) && cents > 0) {
            pricePerPerson = cents / 100
          }
        }
      } catch (err) {
        logger.warn(`Failed to look up menu pricing: ${err instanceof Error ? err.message : String(err)}`)
      }

      // No matrix row or zero price: store $0 total; host and chef agree pricing before acceptance (see storefront copy).
      if (pricePerPerson == null) {
        pricePerPerson = 0
      }
    } else {
      // No menu (or no experience id): catalog, then legacy
      if (experienceTypeId) {
        try {
          const experienceTypeSvc = req.scope.resolve(EXPERIENCE_TYPE_MODULE) as ExperienceTypeModuleService
          const experienceType = await experienceTypeSvc.retrieveExperienceType(experienceTypeId)
          if (experienceType.price_per_unit != null) {
            pricePerPerson = Number(experienceType.price_per_unit) / 100
          }
        } catch {
          // ignore
        }
      }

      if (pricePerPerson == null) {
        pricePerPerson = fallbackPricePerPersonFromStrings(eventType, experienceSlug)
      }
    }

    const totalPrice = pricePerPerson * validatedData.partySize

    const { result } = await createChefEventWorkflow(req.scope).run({
      input: {
        ...validatedData,
        eventType,
        experience_type_id: experienceTypeId,
        status: 'pending',
        totalPrice,
        depositPaid: false,
      }
    })

    res.status(201).json({
      chefEvent: result.chefEvent,
      message: "Event request submitted successfully. You will receive a response within 24-48 hours."
    })

  } catch (error) {
    logger.error(`Error creating store chef event request: ${error instanceof Error ? error.message : String(error)}`)

    if (error instanceof z.ZodError) {
      res.status(400).json({
        message: "Validation error",
        errors: error.errors
      })
      return
    }

    res.status(500).json({
      message: "Internal server error",
      error: error instanceof Error ? error.message : "Unknown error"
    })
  }
}
