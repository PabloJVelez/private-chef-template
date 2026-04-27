import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { MedusaError } from "@medusajs/framework/utils"
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

    if (error instanceof MedusaError) {
      if (error.type === MedusaError.Types.NOT_FOUND) {
        res.status(404).json({ message: "Chef event not found" })
        return
      }
      if (error.type === MedusaError.Types.INVALID_DATA) {
        res.status(400).json({ message: error.message })
        return
      }
      if (error.type === MedusaError.Types.NOT_ALLOWED) {
        res.status(409).json({ message: error.message })
        return
      }
      if (error.type === MedusaError.Types.UNEXPECTED_STATE) {
        res.status(500).json({ message: error.message })
        return
      }
      res.status(400).json({ message: error.message })
      return
    }

    res.status(500).json({
      message: "Internal server error",
      error: error instanceof Error ? error.message : "Unknown error",
    })
  }
}
