import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { z } from "zod"
import { initializeChefEventCartWorkflow } from "../../../../../workflows/initialize-chef-event-cart"

const initializeCartSchema = z.object({
  quantity: z.number().int().min(1),
  cart_id: z.string().optional(),
})

export async function POST(req: MedusaRequest, res: MedusaResponse) {
  const { id } = req.params
  const validated = initializeCartSchema.parse(req.body)

  const { result } = await initializeChefEventCartWorkflow(req.scope).run({
    input: {
      chef_event_id: id,
      quantity: validated.quantity,
      cart_id: validated.cart_id,
    },
  })

  res.status(200).json(result)
}
