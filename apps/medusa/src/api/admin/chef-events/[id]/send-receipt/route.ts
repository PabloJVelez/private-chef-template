import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { MedusaError } from "@medusajs/framework/utils"
import { z } from "zod"
import { sendReceiptWorkflow } from "../../../../../workflows/send-receipt"
import { CHEF_EVENT_MODULE } from "../../../../../modules/chef-event"

const sendReceiptSchema = z.object({
  recipients: z.array(z.string().email()).optional(),
  notes: z.string().optional(),
  tipAmount: z.number().nonnegative().optional(),
  tipMethod: z.string().min(1).optional(),
})

export async function POST(req: MedusaRequest, res: MedusaResponse) {
  const { id } = req.params
  const logger = req.scope.resolve("logger")

  let body: z.infer<typeof sendReceiptSchema>
  try {
    body = sendReceiptSchema.parse(req.body ?? {})
  } catch (e) {
    return res.status(400).json({
      success: false,
      message: "Invalid request body",
      error: e instanceof z.ZodError ? e.flatten() : String(e),
    })
  }

  const chefEventModuleService = req.scope.resolve(CHEF_EVENT_MODULE) as {
    retrieveChefEvent: (id: string) => Promise<Record<string, unknown> | null>
  }

  const chefEvent = await chefEventModuleService.retrieveChefEvent(id)
  if (!chefEvent) {
    return res.status(404).json({ success: false, message: "Chef event not found" })
  }

  if (chefEvent.status !== "confirmed") {
    return res.status(400).json({
      success: false,
      message: "Receipt can only be sent for confirmed events",
    })
  }

  if (!chefEvent.productId) {
    return res.status(400).json({
      success: false,
      message: "Chef event must have a ticket product before sending a receipt",
    })
  }

  const tipAmount = body.tipAmount
  const tipMethod = body.tipMethod?.trim()
  if (tipAmount != null && tipAmount > 0 && (!tipMethod || tipMethod.length === 0)) {
    return res.status(400).json({
      success: false,
      message: "Tip method is required when a tip amount is provided",
    })
  }

  try {
    const { result } = await sendReceiptWorkflow(req.scope).run({
      input: {
        chefEventId: id,
        recipients: body.recipients,
        notes: body.notes,
        tipAmount: tipAmount,
        tipMethod: tipMethod || undefined,
      },
    })

    return res.status(200).json({
      success: true,
      data: result,
    })
  } catch (error) {
    if (error instanceof MedusaError) {
      return res.status(400).json({
        success: false,
        message: error.message,
      })
    }
    logger.error(
      `Error sending receipt: ${error instanceof Error ? error.message : String(error)}`
    )
    return res.status(500).json({
      success: false,
      message: "Failed to send receipt",
      error: error instanceof Error ? error.message : "Unknown error",
    })
  }
}
