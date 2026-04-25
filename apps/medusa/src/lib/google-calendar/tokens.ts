import { decryptSecret, encryptSecret } from "./crypto";

type RefreshTokenResponse = {
  access_token: string;
  expires_in: number;
};

export async function refreshAccessToken(refreshToken: string) {
  const clientId = process.env.GOOGLE_CALENDAR_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CALENDAR_CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    throw new Error("Missing Google OAuth client credentials");
  }

  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: refreshToken,
      grant_type: "refresh_token",
    }),
  });

  if (!response.ok) {
    throw new Error(`Google token refresh failed: ${await response.text()}`);
  }

  return (await response.json()) as RefreshTokenResponse;
}

export async function ensureValidAccessToken(
  connection: Record<string, unknown>,
  persist: (payload: Record<string, unknown>) => Promise<void>,
): Promise<string> {
  const encryptedAccess = connection.accessTokenEnc as string | undefined;
  const encryptedRefresh = connection.refreshTokenEnc as string | undefined;
  const expiresAtRaw = connection.accessTokenExpiresAt as string | Date | undefined;
  const expiresAt = expiresAtRaw ? new Date(expiresAtRaw).getTime() : 0;

  if (encryptedAccess && Date.now() < expiresAt - 5 * 60 * 1000) {
    return decryptSecret(encryptedAccess);
  }

  if (!encryptedRefresh) {
    throw new Error("Refresh token is unavailable");
  }

  const refreshed = await refreshAccessToken(decryptSecret(encryptedRefresh));
  await persist({
    accessTokenEnc: encryptSecret(refreshed.access_token),
    accessTokenExpiresAt: new Date(Date.now() + refreshed.expires_in * 1000),
    status: "active",
    lastSyncError: null,
  });

  return refreshed.access_token;
}
