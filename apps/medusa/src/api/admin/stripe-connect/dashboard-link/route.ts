import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http";
import { STRIPE_CONNECT_ACCOUNT_MODULE } from "../../../../modules/stripe-connect-account";
import type StripeConnectAccountModuleService from "../../../../modules/stripe-connect-account/service";

/**
 * Opens the right Stripe dashboard destination for the connected account type.
 */
export async function POST(
  req: MedusaRequest,
  res: MedusaResponse,
): Promise<void> {
  const svc = req.scope.resolve(
    STRIPE_CONNECT_ACCOUNT_MODULE,
  ) as StripeConnectAccountModuleService;

  const accounts = await svc.listStripeAccounts({}, { take: 10 });
  const account = accounts.find((item) => !item.disconnected_at);

  if (!account) {
    res
      .status(400)
      .json({ message: "No active Stripe account connection found." });
    return;
  }

  try {
    if ((account.account_type ?? "express") === "express") {
      const { url } = await svc.createExpressDashboardLink(
        account.stripe_account_id,
      );
      res.status(200).json({ url, mode: "express_login" as const });
      return;
    }

    res.status(200).json({
      url: "https://dashboard.stripe.com/dashboard",
      mode: "stripe_dashboard" as const,
      message: "Open Stripe with the account owner login for this business.",
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to open Stripe Dashboard";
    res.status(400).json({ message });
  }
}
