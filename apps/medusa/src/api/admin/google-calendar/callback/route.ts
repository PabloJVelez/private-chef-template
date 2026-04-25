import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http";
import { GOOGLE_CALENDAR_CONNECTION_MODULE } from "../../../../modules/google-calendar-connection";
import type GoogleCalendarConnectionModuleService from "../../../../modules/google-calendar-connection/service";
import { parseAndVerifyState } from "../../../../lib/google-calendar/oauth-state";
import { encryptSecret } from "../../../../lib/google-calendar/crypto";
import { ensureGoogleCalendarWatchAndBootstrapSync } from "../../../../lib/google-calendar/ensure-watch";

type TokenResponse = {
  access_token: string;
  refresh_token?: string;
  expires_in: number;
  scope?: string;
};

export async function GET(
  req: MedusaRequest,
  res: MedusaResponse,
): Promise<void> {
  const svc = req.scope.resolve(
    GOOGLE_CALENDAR_CONNECTION_MODULE,
  ) as GoogleCalendarConnectionModuleService;
  const config = svc.getConfig();

  const code = String(req.query.code ?? "");
  const state = String(req.query.state ?? "");
  if (!code || !state) {
    res.status(400).send("Missing code/state");
    return;
  }

  try {
    parseAndVerifyState(state);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Invalid OAuth callback state";
    res.status(400).send(message);
    return;
  }

  if (!config.clientId || !config.clientSecret || !config.redirectUri) {
    res.status(400).send("Google Calendar OAuth configuration is incomplete.");
    return;
  }

  const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: config.clientId,
      client_secret: config.clientSecret,
      redirect_uri: config.redirectUri,
      grant_type: "authorization_code",
    }),
  });

  if (!tokenRes.ok) {
    res.status(400).send(`Token exchange failed: ${await tokenRes.text()}`);
    return;
  }

  const tokenJson = (await tokenRes.json()) as TokenResponse;
  const payload: Record<string, unknown> = {
    adminUserId: "single-admin",
    calendarId: "primary",
    scope: tokenJson.scope ?? config.scope,
    accessTokenEnc: encryptSecret(tokenJson.access_token),
    accessTokenExpiresAt: new Date(Date.now() + tokenJson.expires_in * 1000),
    status: "active",
    lastSyncError: null,
  };

  if (tokenJson.refresh_token) {
    payload.refreshTokenEnc = encryptSecret(tokenJson.refresh_token);
  }

  await svc.upsertPrimaryConnection(payload);
  await ensureGoogleCalendarWatchAndBootstrapSync(req, svc);

  res.redirect("/app/settings/store");
}
