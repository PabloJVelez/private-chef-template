import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http";
import { STRIPE_CONNECT_ACCOUNT_MODULE } from "../../../modules/stripe-connect-account";
import type StripeConnectAccountModuleService from "../../../modules/stripe-connect-account/service";

export type StripeConnectStatus =
  | "not_connected"
  | "onboarding_incomplete"
  | "pending_verification"
  | "active";

function deriveStatus(
  detailsSubmitted: boolean,
  chargesEnabled: boolean,
): StripeConnectStatus {
  if (chargesEnabled) return "active";
  if (detailsSubmitted) return "pending_verification";
  return "onboarding_incomplete";
}

export async function GET(
  req: MedusaRequest,
  res: MedusaResponse,
): Promise<void> {
  const svc = req.scope.resolve(
    STRIPE_CONNECT_ACCOUNT_MODULE,
  ) as StripeConnectAccountModuleService;

  const [account] = await svc.listStripeAccounts({}, { take: 1 });

  if (!account) {
    res.status(200).json({
      account: null,
      stripe_account: null,
      status: "not_connected" as const,
    });
    return;
  }

  await svc.syncAccountStatus(account.stripe_account_id);

  const [updated] = await svc.listStripeAccounts(
    { id: account.id },
    { take: 1 },
  );
  const record = updated ?? account;

  const stripeAccount = await svc.fetchStripeAccountFromStripe(
    record.stripe_account_id,
  );

  const status = deriveStatus(
    record.details_submitted,
    record.charges_enabled,
  );

  const stripeSnapshot =
    stripeAccount &&
    ({
      id: stripeAccount.id,
      details_submitted: stripeAccount.details_submitted,
      charges_enabled: stripeAccount.charges_enabled,
      payouts_enabled: stripeAccount.payouts_enabled,
      business_profile:
        stripeAccount.business_profile &&
        typeof stripeAccount.business_profile === "object"
          ? {
              name: (stripeAccount.business_profile as { name?: string }).name,
              url: (stripeAccount.business_profile as { url?: string }).url,
            }
          : null,
    } as const);

  res.status(200).json({
    account: {
      id: record.id,
      stripe_account_id: record.stripe_account_id,
      details_submitted: record.details_submitted,
      charges_enabled: record.charges_enabled,
    },
    stripe_account: stripeSnapshot,
    status,
  });
}

export async function DELETE(
  req: MedusaRequest,
  res: MedusaResponse,
): Promise<void> {
  const svc = req.scope.resolve(
    STRIPE_CONNECT_ACCOUNT_MODULE,
  ) as StripeConnectAccountModuleService;

  const [account] = await svc.listStripeAccounts({}, { take: 1 });
  if (!account) {
    res.status(200).json({ deleted: false });
    return;
  }

  await svc.deleteStripeAccounts(account.id);
  res.status(200).json({ deleted: true });
}
