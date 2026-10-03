import crypto from "crypto"

const MAGIC_LINK_SECRET = process.env.JWT_SECRET || "supersecret"
const TOKEN_VALIDITY_HOURS = 48

export interface MagicLinkTokenData {
  eventId: string
  timestamp: number
}

export function generateMagicLinkToken(eventId: string): string {
  const timestamp = Date.now()
  const data = `${eventId}.${timestamp}`
  const signature = crypto
    .createHmac("sha256", MAGIC_LINK_SECRET)
    .update(data)
    .digest("hex")

  return `${data}.${signature}`
}

export function verifyMagicLinkToken(token: string): string | null {
  try {
    const parts = token.split(".")

    if (parts.length !== 3) {
      return null
    }

    const [eventId, timestampStr, signature] = parts
    const timestamp = parseInt(timestampStr, 10)

    if (Number.isNaN(timestamp)) {
      return null
    }

    const expiryTime = timestamp + TOKEN_VALIDITY_HOURS * 60 * 60 * 1000
    if (Date.now() > expiryTime) {
      return null
    }

    const data = `${eventId}.${timestamp}`
    const expectedSignature = crypto
      .createHmac("sha256", MAGIC_LINK_SECRET)
      .update(data)
      .digest("hex")

    if (signature !== expectedSignature) {
      return null
    }

    return eventId
  } catch {
    return null
  }
}

export function normalizeBackendUrl(baseUrl: string): string {
  return baseUrl.replace(/\/+$/, "").replace(/\/app$/, "")
}

export function normalizeAdminUrl(baseUrl: string): string {
  const trimmedBaseUrl = baseUrl.replace(/\/+$/, "")
  return trimmedBaseUrl.endsWith("/app") ? trimmedBaseUrl : `${trimmedBaseUrl}/app`
}

export function generateMagicLinkUrl(eventId: string, baseUrl: string): string {
  const token = generateMagicLinkToken(eventId)
  return `${normalizeBackendUrl(baseUrl)}/auth/magic-link/${token}`
}
