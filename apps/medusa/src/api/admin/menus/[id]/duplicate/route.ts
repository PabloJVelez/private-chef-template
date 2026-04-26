import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { z } from "zod"
import { duplicateMenuWorkflow } from "../../../../../workflows/duplicate-menu"

const duplicateMenuSchema = z.object({
  name: z.string().min(1).optional(),
})

export async function POST(
  req: MedusaRequest,
  res: MedusaResponse
): Promise<void> {
  const logger = req.scope.resolve("logger")

  try {
    const { id } = req.params
    const validatedBody = duplicateMenuSchema.parse(req.body ?? {})

    const { result } = await duplicateMenuWorkflow(req.scope).run({
      input: {
        id,
        name: validatedBody.name,
      },
    })

    res.status(201).json(result.menu)
  } catch (error) {
    logger.error(
      `Error duplicating menu: ${error instanceof Error ? error.message : String(error)}`
    )

    if (error instanceof z.ZodError) {
      res.status(400).json({
        message: "Validation error",
        errors: error.errors,
      })
      return
    }

    if (error instanceof Error && error.message.includes("not found")) {
      res.status(404).json({
        message: "Menu not found",
      })
      return
    }

    res.status(500).json({
      message: "Internal server error",
      error: error instanceof Error ? error.message : "Unknown error",
    })
  }
}
