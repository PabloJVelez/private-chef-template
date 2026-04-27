import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { z } from "zod"
import { revertChefEventMenuWorkflow } from "../../../../../workflows/revert-chef-event-menu"

const revertChefEventMenuSchema = z.object({
  deleteDerivedMenu: z.boolean().optional(),
})

export async function POST(req: MedusaRequest, res: MedusaResponse): Promise<void> {
  const logger = req.scope.resolve("logger")
  const { id } = req.params
  const validatedBody = revertChefEventMenuSchema.parse(req.body ?? {})

  try {
    const { result } = await revertChefEventMenuWorkflow(req.scope).run({
      input: {
        chefEventId: id,
        deleteDerivedMenu: validatedBody.deleteDerivedMenu ?? false,
      },
    })

    res.status(200).json(result)
  } catch (error) {
    logger.error(
      `Error reverting chef-event menu: ${error instanceof Error ? error.message : String(error)}`
    )

    if (error instanceof Error && error.message.includes("not found")) {
      res.status(404).json({ message: "Chef event not found" })
      return
    }

    if (
      error instanceof Error &&
      error.message.includes("does not have a derived menu")
    ) {
      res.status(400).json({ message: error.message })
      return
    }

    res.status(500).json({
      message: "Internal server error",
      error: error instanceof Error ? error.message : "Unknown error",
    })
  }
}
