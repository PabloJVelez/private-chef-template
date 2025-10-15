import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"

// Temporary endpoint to verify Sentry error and transaction capture
// GET /admin/sentry-test
export async function GET(
  _req: MedusaRequest,
  _res: MedusaResponse
) {
  const ts = new Date().toISOString()
  // Throw an error to be picked up by Sentry's Express error handler
  throw new Error(`Sentry test error at ${ts}`)
}

// Make it callable without auth for quick verification
export const AUTHENTICATE = false

