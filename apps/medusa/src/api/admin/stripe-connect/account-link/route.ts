import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http";
import { z } from "zod";
import { STRIPE_CONNECT_ACCOUNT_MODULE } from "../../../../modules/stripe-connect-account";
import type StripeConnectAccountModuleService from "../../../../modules/stripe-connect-account/service";

const bodySchema = z.object({
  business_name: z.string().optional(),
  email: z.string().email().optional().or(z.literal("")),
  country: z.string().optional(),
});

export async function POST(
  req: MedusaRequest,
  res: MedusaResponse,
): Promise<void> {
  const svc = req.scope.resolve(
    STRIPE_CONNECT_ACCOUNT_MODULE,
  ) as StripeConnectAccountModuleService;

  const parsed = bodySchema.safeParse(req.body ?? {});
  const body = parsed.success ? parsed.data : {};

  const businessName = body.business_name;
  const email = body.email && body.email !== "" ? body.email : undefined;
  const country = body.country;

  try {
    const { stripe_account_id } = await svc.getOrCreateStripeAccount(
      businessName,
      email,
      country,
    );
    const { url } = await svc.getAccountLink(stripe_account_id);
    res.status(200).json({ url });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to create account link";
    res.status(400).json({ message });
  }
}
