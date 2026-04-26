import crypto from "node:crypto";

type OAuthStatePayload = {
  nonce: string;
  ts: number;
  returnTo?: string;
};

function getSigningSecret() {
  const secret = process.env.GOOGLE_CALENDAR_SIGNING_SECRET;
  if (!secret) {
    throw new Error("Missing GOOGLE_CALENDAR_SIGNING_SECRET");
  }
  return secret;
}

export function buildState(payload: OAuthStatePayload): string {
  const body = Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
  const signature = crypto
    .createHmac("sha256", getSigningSecret())
    .update(body)
    .digest("base64url");
  return `${body}.${signature}`;
}

export function parseAndVerifyState(state: string): OAuthStatePayload {
  const [body, signature] = state.split(".");
  if (!body || !signature) {
    throw new Error("Invalid OAuth state format");
  }

  const expected = crypto
    .createHmac("sha256", getSigningSecret())
    .update(body)
    .digest("base64url");

  if (!crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected))) {
    throw new Error("Invalid OAuth state signature");
  }

  const payload = JSON.parse(
    Buffer.from(body, "base64url").toString("utf8"),
  ) as OAuthStatePayload;

  if (!payload.nonce || typeof payload.ts !== "number") {
    throw new Error("Malformed OAuth state payload");
  }

  return payload;
}
