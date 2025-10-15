import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { z } from "zod"
import { MedusaError, Modules } from "@medusajs/framework/utils"
import { deleteUsersWorkflow } from "@medusajs/medusa/core-flows"

const deleteUserByEmailSchema = z.object({
  email: z.string().email("Please provide a valid email address"),
})

export async function DELETE(
  req: MedusaRequest,
  res: MedusaResponse
): Promise<void> {
  try {
    console.log("🗑️ Deleting user by email...")
    console.log("Request body:", req.body)
    
    const validatedBody = deleteUserByEmailSchema.parse(req.body)
    
    console.log("✅ Validated request:", {
      email: validatedBody.email,
    })
    
    // Get the user service from Medusa's built-in user module
    const userService = req.scope.resolve(Modules.USER)
    
    // Find user by email first
    const users = await userService.listUsers({
      email: validatedBody.email,
    })
    
    if (!users || users.length === 0) {
      console.log("❌ User not found with email:", validatedBody.email)
      res.status(404).json({
        message: "User not found",
        email: validatedBody.email,
      })
      return
    }
    
    const user = users[0]
    console.log("✅ Found user:", { id: user.id, email: user.email })
    
    // Use Medusa's deleteUsersWorkflow to delete the user
    const { result } = await deleteUsersWorkflow(req.scope).run({
      input: {
        ids: [user.id],
      },
    })
    
    console.log("✅ Successfully deleted user using workflow:", result)
    
    res.status(200).json({
      message: "User deleted successfully",
      email: validatedBody.email,
      userId: user.id,
      workflowResult: result,
    })
    
  } catch (error) {
    console.error("❌ Error deleting user by email:", error)
    
    if (error instanceof z.ZodError) {
      res.status(400).json({
        message: "Invalid request data",
        errors: error.errors,
      })
      return
    }
    
    if (error instanceof MedusaError) {
      res.status(500).json({
        message: error.message,
        type: error.type,
      })
      return
    }
    
    res.status(500).json({
      message: "Failed to delete user",
      error: error instanceof Error ? error.message : "Unknown error",
    })
  }
}

export const AUTHENTICATE = false
