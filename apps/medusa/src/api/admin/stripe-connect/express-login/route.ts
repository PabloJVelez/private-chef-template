import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http";
import { STRIPE_CONNECT_ACCOUNT_MODULE } from "../../../../modules/stripe-connect-account";
import type StripeConnectAccountModuleService from "../../../../modules/stripe-connect-account/service";

/**
 * Generates a single-use Express Dashboard login link.
 * The link opens the chef's Express Dashboard on Stripe.
 */
export async function POST(
  req: MedusaRequest,
  res: MedusaResponse,
): Promise<void> {
  const svc = req.scope.resolve(
    STRIPE_CONNECT_ACCOUNT_MODULE,
  ) as StripeConnectAccountModuleService;

  const [account] = await svc.listStripeAccounts(
    { charges_enabled: true },
    { take: 1 },
  );

  if (!account) {
    res
      .status(400)
      .json({ message: "No active Stripe Connect account found." });
    return;
  }

  try {
    const { url } = await svc.createExpressDashboardLink(
      account.stripe_account_id,
    );
    res.status(200).json({ url });
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "Failed to create Express Dashboard link";
    res.status(400).json({ message });
  }
}
