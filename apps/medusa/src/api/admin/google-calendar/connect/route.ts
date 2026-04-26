import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http";
import crypto from "node:crypto";
import { GOOGLE_CALENDAR_CONNECTION_MODULE } from "../../../../modules/google-calendar-connection";
import type GoogleCalendarConnectionModuleService from "../../../../modules/google-calendar-connection/service";
import { buildState } from "../../../../lib/google-calendar/oauth-state";

export async function POST(
  req: MedusaRequest,
  res: MedusaResponse,
): Promise<void> {
  const svc = req.scope.resolve(
    GOOGLE_CALENDAR_CONNECTION_MODULE,
  ) as GoogleCalendarConnectionModuleService;
  const config = svc.getConfig();

  if (!config.clientId || !config.redirectUri) {
    res.status(400).json({
      message: "Google Calendar OAuth is not configured.",
    });
    return;
  }

  const state = buildState({
    nonce: crypto.randomBytes(16).toString("hex"),
    ts: Date.now(),
    returnTo: "/app/settings/store",
  });

  const url = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  url.searchParams.set("client_id", config.clientId);
  url.searchParams.set("redirect_uri", config.redirectUri);
  url.searchParams.set("response_type", "code");
  url.searchParams.set(
    "scope",
    config.scope ?? "https://www.googleapis.com/auth/calendar.events",
  );
  url.searchParams.set("access_type", "offline");
  url.searchParams.set("include_granted_scopes", "true");
  url.searchParams.set("prompt", "consent");
  url.searchParams.set("state", state);

  res.status(200).json({ url: url.toString() });
}
