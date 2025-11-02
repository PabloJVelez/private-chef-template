import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { z } from "zod"
import { createChefEventWorkflow } from "../../../workflows/create-chef-event"

// Validation schema for store chef event requests
const createStoreChefEventSchema = z.object({
  requestedDate: z.string().datetime(),
  requestedTime: z.string().regex(/^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/, "Invalid time format"),
  partySize: z.number().min(2, "Minimum party size is 2").max(50, "Maximum party size is 50"),
  eventType: z.enum(['cooking_class', 'plated_dinner', 'buffet_style']),
  templateProductId: z.string().optional(),
  locationType: z.enum(['customer_location', 'chef_location']),
  locationAddress: z.string().min(10, "Address must be at least 10 characters"),
  firstName: z.string().min(1, "First name is required"),
  lastName: z.string().min(1, "Last name is required"),
  email: z.string().email("Valid email is required"),
  phone: z.string().optional(),
  notes: z.string().optional(),
  specialRequirements: z.string().optional()
})

// Pricing structure as defined in the business rules
const PRICING_STRUCTURE = {
  'buffet_style': 99.99,
  'cooking_class': 119.99,
  'plated_dinner': 149.99
} as const

export async function POST(
  req: MedusaRequest,
  res: MedusaResponse
): Promise<void> {
  const logger = req.scope.resolve("logger")

  try {
    const validatedData = createStoreChefEventSchema.parse(req.body)
    
    // Auto-calculate pricing based on event type and party size
    const pricePerPerson = PRICING_STRUCTURE[validatedData.eventType]
    const totalPrice = pricePerPerson * validatedData.partySize
    
    // Create chef event request with calculated pricing and pending status
    const { result } = await createChefEventWorkflow(req.scope).run({
      input: {
        ...validatedData,
        status: 'pending', // Always pending for customer requests
        totalPrice,
        depositPaid: false // No deposit required as per business rules
      }
    })
    
    res.status(200).json({
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