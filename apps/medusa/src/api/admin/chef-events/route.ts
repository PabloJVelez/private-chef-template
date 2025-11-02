import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { z } from "zod"
import { createChefEventWorkflow } from "../../../workflows/create-chef-event"
import { CHEF_EVENT_MODULE } from "../../../modules/chef-event" 

const createChefEventSchema = z.object({
  status: z.enum(['pending', 'confirmed', 'cancelled', 'completed']).default('pending'),
  requestedDate: z.string(),
  requestedTime: z.string(),
  partySize: z.number().min(1).max(50),
  eventType: z.enum(['cooking_class', 'plated_dinner', 'buffet_style']),
  templateProductId: z.string().optional(),
  locationType: z.enum(['customer_location', 'chef_location']),
  locationAddress: z.string().min(1),
  firstName: z.string().min(1),
  lastName: z.string().min(1),
  email: z.string().email(),
  phone: z.string().optional(),
  notes: z.string().optional(),
  totalPrice: z.number().optional(),
  depositPaid: z.boolean().optional(),
  specialRequirements: z.string().optional(),
  estimatedDuration: z.number().optional()
})

export async function GET(req: MedusaRequest, res: MedusaResponse) {
  const chefEventModuleService = req.scope.resolve(CHEF_EVENT_MODULE) as any
  
  const { q, status, eventType, locationType } = req.query
  const limit = parseInt(req.query.limit as string) || 20
  const offset = parseInt(req.query.offset as string) || 0
  
  const filters: any = {}
  if (q) filters.q = q
  if (status && status !== 'all') filters.status = status
  if (eventType && eventType !== 'all') filters.eventType = eventType
  if (locationType && locationType !== 'all') filters.locationType = locationType
  
  const [chefEvents, count] = await chefEventModuleService.listAndCountChefEvents(filters, {
    take: limit,
    skip: offset,
    order: { requestedDate: 'ASC' }
  })
  
  res.json({
    chefEvents,
    count,
    limit,
    offset
  })
}

export async function POST(req: MedusaRequest, res: MedusaResponse) {
  const validatedBody = createChefEventSchema.parse(req.body)
  
  const { result } = await createChefEventWorkflow(req.scope).run({
    input: validatedBody
  })
  
  res.status(201).json({ chefEvent: result.chefEvent })
} 