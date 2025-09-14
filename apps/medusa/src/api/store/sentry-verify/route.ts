import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import * as Sentry from "@sentry/node"

function ensureSentryInit() {
  if (!Sentry.isInitialized()) {
    Sentry.init({
      dsn: process.env.SENTRY_DSN || "",
      tracesSampleRate: 1.0,
      environment: process.env.SENTRY_ENVIRONMENT || process.env.NODE_ENV,
    })
  }
}

export async function GET(_req: MedusaRequest, res: MedusaResponse) {
  ensureSentryInit()
  const ts = new Date().toISOString()
  // send a message and an exception to validate ingestion
  Sentry.captureMessage(`Sentry manual verify ping at ${ts}`)
  Sentry.captureException(new Error(`Sentry manual verify error at ${ts}`))
  res.json({ ok: true, ts })
}

export const AUTHENTICATE = false
