import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { z } from "@medusajs/framework/zod"
import { linkSalesChannelsToApiKeyWorkflow } from "@medusajs/medusa/core-flows"

const linkSalesChannelApiKeySchema = z.object({
  apiKeyId: z.string().min(1, "API Key ID is required"),
  salesChannelId: z.string().min(1, "Sales Channel ID is required"),
})

export async function POST(
  req: MedusaRequest,
  res: MedusaResponse
): Promise<void> {
  try {
    console.log("🔗 Linking sales channel to API key...")
    console.log("Request body:", req.body)
    
    const validatedBody = linkSalesChannelApiKeySchema.parse(req.body)
    
    console.log("✅ Validated request:", {
      apiKeyId: validatedBody.apiKeyId,
      salesChannelId: validatedBody.salesChannelId,
    })
    
    // Run the linking workflow
    await linkSalesChannelsToApiKeyWorkflow(req.scope).run({
      input: {
        id: validatedBody.apiKeyId,
        add: [validatedBody.salesChannelId],
      },
    })
    
    console.log("✅ Successfully linked sales channel to API key")
    
    res.status(200).json({
      message: "Sales channel linked to API key successfully",
      apiKeyId: validatedBody.apiKeyId,
      salesChannelId: validatedBody.salesChannelId,
    })
    
  } catch (error) {
    console.error("❌ Error linking sales channel to API key:", error)
    
    if (error instanceof z.ZodError) {
      res.status(400).json({
        message: "Invalid request data",
        errors: error.issues,
      })
      return
    }
    
    res.status(500).json({
      message: "Failed to link sales channel to API key",
      error: error instanceof Error ? error.message : "Unknown error",
    })
  }
} 

export const AUTHENTICATE = false