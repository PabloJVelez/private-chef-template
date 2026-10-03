import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { Modules } from "@medusajs/framework/utils"
import { normalizeAdminUrl, verifyMagicLinkToken } from "../../../../modules/utils/magic-link"
import ChefEventModuleService from "../../../../modules/chef-event/service"

type AdminUser = {
  id: string
  email: string
}

type AuthIdentity = {
  id: string
  app_metadata?: {
    user_id?: string
  } | null
}

function getMagicLinkAdminEmail(): string | null {
  return (
    process.env.CHEF_MAGIC_LINK_ADMIN_EMAIL ||
    process.env.CHEF_NOTIFICATIONS_LIST?.split(",").map((email) => email.trim()).filter(Boolean)[0] ||
    null
  )
}

async function getOrCreateMagicLinkAdminAuthContext(req: MedusaRequest) {
  const userService = req.scope.resolve(Modules.USER) as {
    listUsers: (filters: { email: string }) => Promise<AdminUser[]>
    createUsers: (data: { email: string }) => Promise<AdminUser | AdminUser[]>
  }
  const authService = req.scope.resolve(Modules.AUTH) as {
    listAuthIdentities: (filters: { app_metadata: { user_id: string } }) => Promise<AuthIdentity[]>
    createAuthIdentities: (data: { app_metadata: { user_id: string } }) => Promise<AuthIdentity | AuthIdentity[]>
  }

  const email = getMagicLinkAdminEmail()
  if (!email) {
    throw new Error("No chef admin email is configured for magic-link authentication.")
  }

  const users = await userService.listUsers({ email })
  let user = users[0]
  if (!user) {
    const created = await userService.createUsers({ email })
    user = Array.isArray(created) ? created[0] : created
  }

  const authIdentities = await authService.listAuthIdentities({
    app_metadata: {
      user_id: user.id,
    },
  })
  let authIdentity = authIdentities[0]
  if (!authIdentity) {
    const created = await authService.createAuthIdentities({
      app_metadata: {
        user_id: user.id,
      },
    })
    authIdentity = Array.isArray(created) ? created[0] : created
  }

  return {
    actor_id: user.id,
    actor_type: "user",
    auth_identity_id: authIdentity.id,
    app_metadata: {
      user_id: user.id,
    },
  }
}

export async function GET(req: MedusaRequest<{ token: string }>, res: MedusaResponse): Promise<void> {
  const { token } = req.params
  const getAdminUrl = () =>
    normalizeAdminUrl(process.env.MEDUSA_ADMIN_URL || process.env.ADMIN_BACKEND_URL || "http://localhost:9000")

  try {
    const eventId = verifyMagicLinkToken(token)

    if (!eventId) {
      return res.redirect(
        `${getAdminUrl()}?error=invalid_token&message=${encodeURIComponent("This magic link is invalid or has expired. Please check your email for a newer link or contact support.")}`,
      )
    }

    const chefEventModuleService: ChefEventModuleService = req.scope.resolve("chefEventModuleService")
    const chefEvent = await chefEventModuleService.retrieveChefEvent(eventId)

    if (!chefEvent) {
      return res.redirect(
        `${getAdminUrl()}?error=event_not_found&message=${encodeURIComponent("The chef event could not be found.")}`,
      )
    }

    req.session.auth_context = await getOrCreateMagicLinkAdminAuthContext(req)
    res.redirect(`${getAdminUrl()}/chef-events/${chefEvent.id}?from_magic_link=true`)
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "An unexpected error occurred"

    res.redirect(`${getAdminUrl()}?error=authentication_failed&message=${encodeURIComponent(errorMessage)}`)
  }
}
