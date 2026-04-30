import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { MedusaError } from "@medusajs/framework/utils"
import { z } from "zod"
import { createChefEventWorkflow } from "../../../workflows/create-chef-event"
import { CHEF_EVENT_MODULE } from "../../../modules/chef-event"

const chefEventStatusEnum = z.enum(["pending", "confirmed", "cancelled", "completed"])

/** Split CSV from `statuses` query; supports Express string | string[]. */
function rawStatusesToParts(raw: unknown): string[] {
  if (raw === undefined || raw === null) {
    return []
  }
  if (Array.isArray(raw)) {
    return raw
      .join(",")
      .split(",")
      .map((s) => String(s).trim())
      .filter(Boolean)
  }
  return String(raw)
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)
}

const createChefEventSchema = z.object({
  status: z.enum(['pending', 'confirmed', 'cancelled', 'completed']).default('pending'),
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
  const chefEventModuleService = req.scope.resolve(CHEF_EVENT_MODULE) as any

  const { q, status, eventType, locationType, statuses } = req.query
  const limit = parseInt(req.query.limit as string) || 20
  const offset = parseInt(req.query.offset as string) || 0

  const filters: Record<string, unknown> = {}
  if (q) filters.q = q
  if (eventType && eventType !== "all") filters.eventType = eventType
  if (locationType && locationType !== "all") filters.locationType = locationType

  // `statuses` (comma-separated) wins over legacy single `status` when present.
  const statusParts = rawStatusesToParts(statuses)
  if (statusParts.length > 0) {
    const parsed = z.array(chefEventStatusEnum).safeParse(statusParts)
    if (!parsed.success) {
      throw new MedusaError(
        MedusaError.Types.INVALID_DATA,
        "Invalid status value in `statuses`. Use one or more of: pending, confirmed, cancelled, completed."
      )
    }
    const unique = [...new Set(parsed.data)]
    filters.status =
      unique.length === 1 ? unique[0]! : { $in: unique }
  } else if (status && status !== "all") {
    const single = chefEventStatusEnum.safeParse(status)
    if (!single.success) {
      throw new MedusaError(
        MedusaError.Types.INVALID_DATA,
        "Invalid `status`. Use pending, confirmed, cancelled, or completed."
      )
    }
    filters.status = single.data
  }

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