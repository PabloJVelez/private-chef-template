import { decryptSecret, encryptSecret } from "./crypto";

type RefreshTokenResponse = {
  access_token: string;
  expires_in: number;
};

const REFRESH_RETRY_ATTEMPTS = 3;
const REFRESH_RETRY_BASE_DELAY_MS = 250;

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

/**
 * Calls Google's token endpoint to exchange a refresh token for a new access
 * token. Retries transient (5xx + network) errors with exponential backoff +
 * jitter; permanent failures (4xx other than 429) bubble up immediately so
 * the calling code can flip the connection to `reauthorization_required`.
 */
export async function refreshAccessToken(
  refreshToken: string,
): Promise<RefreshTokenResponse> {
  const clientId = process.env.GOOGLE_CALENDAR_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CALENDAR_CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    throw new Error("Missing Google OAuth client credentials");
  }

  let lastError: unknown = null;
  for (let attempt = 1; attempt <= REFRESH_RETRY_ATTEMPTS; attempt += 1) {
    try {
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

      if (response.ok) {
        return (await response.json()) as RefreshTokenResponse;
      }

      const text = await response.text();
      const isRetryable = response.status >= 500 || response.status === 429;
      if (!isRetryable || attempt === REFRESH_RETRY_ATTEMPTS) {
        throw new Error(`Google token refresh failed: ${text}`);
      }
      lastError = new Error(text);
    } catch (error) {
      if (attempt === REFRESH_RETRY_ATTEMPTS) {
        throw error;
      }
      lastError = error;
    }

    const jitter = Math.random() * REFRESH_RETRY_BASE_DELAY_MS;
    await delay(REFRESH_RETRY_BASE_DELAY_MS * 2 ** (attempt - 1) + jitter);
  }

  throw lastError instanceof Error
    ? lastError
    : new Error("Google token refresh failed");
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

  try {
    const refreshed = await refreshAccessToken(decryptSecret(encryptedRefresh));
    await persist({
      accessTokenEnc: encryptSecret(refreshed.access_token),
      accessTokenExpiresAt: new Date(Date.now() + refreshed.expires_in * 1000),
      status: "active",
      lastSyncError: null,
    });

    return refreshed.access_token;
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unknown token refresh error";
    await persist({
      status: "reauthorization_required",
      lastSyncError: message,
    });
    throw error;
  }
}
