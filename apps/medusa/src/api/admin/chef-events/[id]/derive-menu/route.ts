import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { createOrGetChefEventMenuWorkflow } from "../../../../../workflows/create-or-get-chef-event-menu"

export async function POST(req: MedusaRequest, res: MedusaResponse): Promise<void> {
  const logger = req.scope.resolve("logger")
  const { id } = req.params

  try {
    const { result } = await createOrGetChefEventMenuWorkflow(req.scope).run({
      input: {
        chefEventId: id,
      },
    })

    res.status(result.created ? 201 : 200).json(result)
  } catch (error) {
    logger.error(
      `Error deriving chef-event menu: ${error instanceof Error ? error.message : String(error)}`
    )

    if (error instanceof Error && error.message.includes("not found")) {
      res.status(404).json({ message: "Chef event not found" })
      return
    }

    if (
      error instanceof Error &&
      error.message.includes("does not have a template menu selected")
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
