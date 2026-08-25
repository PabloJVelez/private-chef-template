import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http";
import { STRIPE_CONNECT_ACCOUNT_MODULE } from "../../../../../modules/stripe-connect-account";
import type StripeConnectAccountModuleService from "../../../../../modules/stripe-connect-account/service";

/**
 * Starts OAuth for chefs connecting an existing Stripe Standard account.
 */
export async function POST(
  req: MedusaRequest,
  res: MedusaResponse,
): Promise<void> {
  const svc = req.scope.resolve(
    STRIPE_CONNECT_ACCOUNT_MODULE,
  ) as StripeConnectAccountModuleService;

  try {
    const { url } = await svc.getStandardAccountOAuthUrl();
    res.status(200).json({ url });
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "Failed to start Stripe account connection";
    res.status(400).json({ message });
  }
}
