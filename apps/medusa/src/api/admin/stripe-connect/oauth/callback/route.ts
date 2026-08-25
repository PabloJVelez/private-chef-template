import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http";
import { STRIPE_CONNECT_ACCOUNT_MODULE } from "../../../../../modules/stripe-connect-account";
import type StripeConnectAccountModuleService from "../../../../../modules/stripe-connect-account/service";

/**
 * Completes OAuth for chefs connecting an existing Stripe Standard account.
 */
export async function GET(
  req: MedusaRequest,
  res: MedusaResponse,
): Promise<void> {
  const svc = req.scope.resolve(
    STRIPE_CONNECT_ACCOUNT_MODULE,
  ) as StripeConnectAccountModuleService;

  const error = String(req.query.error ?? "");
  const errorDescription = String(req.query.error_description ?? "");
  const code = String(req.query.code ?? "");
  const state = String(req.query.state ?? "");

  if (error) {
    const redirectUrl = new URL(await svc.getAdminStoreSettingsUrl());
    redirectUrl.searchParams.set("stripe_connect", "error");
    redirectUrl.searchParams.set(
      "message",
      errorDescription || error || "Stripe account connection was canceled.",
    );
    res.redirect(redirectUrl.toString());
    return;
  }

  if (!code || !state) {
    res.status(400).send("Missing Stripe OAuth code/state.");
    return;
  }

  try {
    const { return_to } = await svc.completeStandardAccountOAuth({
      code,
      state,
    });
    const redirectUrl = new URL(return_to);
    redirectUrl.searchParams.set("stripe_connect", "connected");
    res.redirect(redirectUrl.toString());
  } catch (callbackError) {
    const message =
      callbackError instanceof Error
        ? callbackError.message
        : "Failed to connect Stripe account.";
    res.status(400).send(message);
  }
}
