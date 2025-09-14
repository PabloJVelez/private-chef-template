// Sentry + OpenTelemetry setup using Sentry's built-in OTEL bridge (no `any` used).
import * as Sentry from "@sentry/node"

export async function register() {
  // Initialize the Sentry client once
  if (!Sentry.isInitialized()) {
    const client = Sentry.init({
      dsn: process.env.SENTRY_DSN || "",
      tracesSampleRate: 1.0,
      environment: process.env.SENTRY_ENVIRONMENT || process.env.NODE_ENV,
      // Enable Sentry Logs product and capture console.* as logs
      enableLogs: true,
      integrations: [Sentry.consoleLoggingIntegration()],
      // By default, Sentry v8 configures OpenTelemetry automatically.
      // If you prefer to manage OTEL yourself, set `skipOpenTelemetrySetup: true`.
    })

    if (client) {
      // Let Sentry wire up OpenTelemetry (span processor, propagator, loader hooks)
      Sentry.initOpenTelemetry(client)
    }
  }
}
