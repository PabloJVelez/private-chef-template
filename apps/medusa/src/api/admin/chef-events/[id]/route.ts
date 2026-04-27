import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { z } from "zod"
import { updateChefEventWorkflow } from "../../../../workflows/update-chef-event"
import { deleteChefEventWorkflow } from "../../../../workflows/delete-chef-event"
import { CHEF_EVENT_MODULE } from "../../../../modules/chef-event"
import { getAvailableTicketsForProduct } from "../../../../lib/chef-event-available-tickets"

const updateChefEventSchema = z.object({
  status: z.enum(['pending', 'confirmed', 'cancelled', 'completed']).optional(),
  requestedDate: z.string().optional(),
  requestedTime: z.string().optional(),
  partySize: z.number().min(1).max(50).optional(),
  eventType: z.string().min(1).optional(),
  experience_type_id: z.string().nullable().optional(),
  templateProductId: z.string().optional(),
  locationType: z.enum(['customer_location', 'chef_location']).optional(),
  locationAddress: z.string().min(1).optional(),
  firstName: z.string().min(1).optional(),
  lastName: z.string().min(1).optional(),
  email: z.string().email().optional(),
  phone: z.string().optional(),
  notes: z.string().optional(),
  totalPrice: z.number().optional(),
  depositPaid: z.boolean().optional(),
  specialRequirements: z.string().optional(),
  estimatedDuration: z.number().optional()
})

export async function GET(req: MedusaRequest, res: MedusaResponse) {
  const chefEventModuleService = req.scope.resolve(CHEF_EVENT_MODULE) as any
  const { id } = req.params
  
  const chefEvent = await chefEventModuleService.retrieveChefEvent(id)
  
  if (!chefEvent) {
    return res.status(404).json({ message: "Chef event not found" })
  }

  let availableTickets: number | undefined
  if (chefEvent.productId) {
    availableTickets = await getAvailableTicketsForProduct(req.scope, chefEvent.productId)
  }

  res.json({ chefEvent: { ...chefEvent, ...(availableTickets !== undefined ? { availableTickets } : {}) } })
}

export async function POST(req: MedusaRequest, res: MedusaResponse) {
  const { id } = req.params
  const validatedBody = updateChefEventSchema.parse(req.body)

  try {
    const { result } = await updateChefEventWorkflow(req.scope).run({
      input: {
        id,
        ...validatedBody
      }
    })

    res.json({ chefEvent: result.chefEvent })
  } catch (error) {
    if (
      error instanceof Error &&
      error.message.includes("Template menu cannot be changed after deriving an event menu")
    ) {
      res.status(400).json({ message: error.message })
      return
    }

    throw error
  }
}

export async function DELETE(req: MedusaRequest, res: MedusaResponse) {
  const { id } = req.params
  
  const { result } = await deleteChefEventWorkflow(req.scope).run({
    input: { id }
  })
  
  res.json({ deleted: result.result.deleted })
} 