import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { z } from "zod"
import { resendEventEmailWorkflow } from "../../../../../workflows/resend-event-email"

const resendEmailSchema = z.object({
  recipients: z.array(z.string().email()),
  notes: z.string().optional(),
  emailType: z.enum(["event_details_resend", "custom_message"]).default("event_details_resend")
})

export async function POST(req: MedusaRequest, res: MedusaResponse) {
  const { id } = req.params
  const validatedBody = resendEmailSchema.parse(req.body)
  const logger = req.scope.resolve("logger")
  
  try {
    const { result } = await resendEventEmailWorkflow(req.scope).run({
      input: {
        chefEventId: id,
        recipients: validatedBody.recipients,
        notes: validatedBody.notes,
        emailType: validatedBody.emailType
      }
    })
    
    res.status(200).json({
      success: true,
      data: result
    })
  } catch (error) {
    logger.error(`Error resending event email: ${error instanceof Error ? error.message : String(error)}`)
    res.status(500).json({
      success: false,
      message: "Failed to resend event email",
      error: error instanceof Error ? error.message : "Unknown error"
    })
  }
}