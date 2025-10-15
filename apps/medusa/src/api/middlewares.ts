import { defineMiddlewares, errorHandler, MedusaNextFunction, MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import * as Sentry from "@sentry/node"

// Lazily initialize Sentry to ensure it is available in all environments
let sentryInited = false
function ensureSentry() {
  if (sentryInited) return
  if (!Sentry.isInitialized()) {
    Sentry.init({
      dsn: process.env.SENTRY_DSN || "",
      tracesSampleRate: 1.0,
      environment: process.env.SENTRY_ENVIRONMENT || process.env.NODE_ENV,
      enableLogs: true,
      integrations: [Sentry.consoleLoggingIntegration()],
    })
  }
  sentryInited = true
}

const originalErrorHandler = errorHandler()

export default defineMiddlewares({
  // Capture all API route errors in Sentry
  errorHandler: (
    error: unknown,
    req: MedusaRequest,
    res: MedusaResponse,
    next: MedusaNextFunction
  ) => {
    ensureSentry()
    Sentry.captureException(error instanceof Error ? error : new Error(String(error)))
    // Forward to Medusa's default error handler
    return (originalErrorHandler as (
      err: unknown,
      req: MedusaRequest,
      res: MedusaResponse,
      next: MedusaNextFunction
    ) => void)(error, req, res, next)
  },
})
