import { parseQuery, requestQuery, eventFilters } from '../../../lib/chef-workspace/query'
import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { z } from "@medusajs/framework/zod"
import { createChefEventWorkflow } from "../../../workflows/create-chef-event"
import { CHEF_EVENT_MODULE } from "../../../modules/chef-event"
import type ChefEventModuleService from "../../../modules/chef-event/service"

const createChefEventSchema = z.object({
  status: z.enum(['pending', 'confirmed', 'cancelled', 'completed']).default('pending'),
  slotStart: z.string().datetime().optional(),
  requestedDate: z.string(),
  requestedTime: z.string(),
  partySize: z.number().min(1).max(50),
  eventType: z.string().min(1),
  experience_type_id: z.string().nullable().optional(),
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
  const chefEventModuleService = req.scope.resolve<ChefEventModuleService>(CHEF_EVENT_MODULE)

  const query = parseQuery(requestQuery, req.query)
  const { limit, offset } = query
  const filters = eventFilters(query)

  const [chefEvents, count] = await chefEventModuleService.listAndCountChefEvents(filters, {
    take: limit,
    skip: offset,
    order: { requestedDate: 'ASC', id: 'ASC' }
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