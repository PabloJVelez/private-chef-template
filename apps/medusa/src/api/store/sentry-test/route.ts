import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"

// Public endpoint to verify Sentry error capture via the Store API
// GET /store/sentry-test
export async function GET(
  _req: MedusaRequest,
  _res: MedusaResponse
) {
  const ts = new Date().toISOString()
  throw new Error(`Sentry store test error at ${ts}`)
}

export const AUTHENTICATE = false

