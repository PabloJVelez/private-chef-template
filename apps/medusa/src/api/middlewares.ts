import { authenticate, defineMiddlewares, errorHandler, MedusaNextFunction, MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
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
  routes: [{
    matcher: /^\/admin\/chef-ai\/chat\/?$/i,
    methods: ['POST'],
    bodyParser: { sizeLimit: '12kb' },
    middlewares: [authenticate('user', ['session', 'bearer'])],
  }],
  // Capture all API route errors in Sentry
  errorHandler: (
    error: unknown,
    req: MedusaRequest,
    res: MedusaResponse,
    next: MedusaNextFunction
  ) => {
    ensureSentry()
    if (/^\/admin\/chef-ai\/chat\/?$/i.test(req.path)) {
      // Keep error monitoring, but never attach a parser/provider error containing a prompt.
      Sentry.withScope((scope) => {
        scope.addEventProcessor((event) => {
          if (event.request) delete event.request.data
          return event
        })
        Sentry.captureException(new Error('Schedule chat request failed'))
      })
      const status = (error as { status?: number })?.status
      res.setHeader('Cache-Control', 'no-store')
      res.status(status && status >= 400 && status <= 599 ? status : 500).json({
        message: 'Schedule chat request could not be processed.',
      })
      return
    } else {
      Sentry.captureException(error instanceof Error ? error : new Error(String(error)))
    }
    // Forward to Medusa's default error handler
    return (originalErrorHandler as (
      err: unknown,
      req: MedusaRequest,
      res: MedusaResponse,
      next: MedusaNextFunction
    ) => void)(error, req, res, next)
  },
})
