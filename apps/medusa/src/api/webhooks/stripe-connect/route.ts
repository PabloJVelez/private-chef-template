/**
 * Stripe Connect account.updated webhook.
 * Syncs DB state when Stripe sends account.updated.
 *
 * Note: Signature verification requires the raw request body. If using body parser
 * middleware, configure this route to receive raw body (e.g. express.raw()) or
 * Stripe signature verification will fail when STRIPE_CONNECT_WEBHOOK_SECRET is set.
 */
import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http";
import Stripe from "stripe";
import { STRIPE_CONNECT_ACCOUNT_MODULE } from "../../../modules/stripe-connect-account";
import type StripeConnectAccountModuleService from "../../../modules/stripe-connect-account/service";

const STRIPE_CONNECT_WEBHOOK_SECRET =
  process.env.STRIPE_CONNECT_WEBHOOK_SECRET || "";

export async function POST(
  req: MedusaRequest,
  res: MedusaResponse,
): Promise<void> {
  const signature = req.headers["stripe-signature"] as string | undefined;
  let payload: string | Buffer;

  const body = req.body;
  if (typeof body === "string" || Buffer.isBuffer(body)) {
    payload = body;
  } else if (body && typeof body === "object") {
    if (STRIPE_CONNECT_WEBHOOK_SECRET) {
      res.status(400).json({
        error:
          "Raw body required for webhook signature verification. Configure this route to receive raw body.",
      });
      return;
    }
    const event = body as Stripe.Event;
    if (event.type === "account.updated") {
      const account = event.data?.object as Stripe.Account;
      if (account?.id) {
        const svc = req.scope.resolve(
          STRIPE_CONNECT_ACCOUNT_MODULE,
        ) as StripeConnectAccountModuleService;
        await svc.syncAccountStatus(account.id);
      }
    }
    res.status(200).json({ received: true });
    return;
  } else {
    res.status(400).json({ error: "Missing body" });
    return;
  }

  if (STRIPE_CONNECT_WEBHOOK_SECRET && signature) {
    try {
      const stripe = new Stripe(process.env.STRIPE_API_KEY || "");
      stripe.webhooks.constructEvent(
        payload,
        signature,
        STRIPE_CONNECT_WEBHOOK_SECRET,
      );
    } catch (err) {
      res.status(400).json({ error: "Webhook signature verification failed" });
      return;
    }
  }

  const event = JSON.parse(
    typeof payload === "string" ? payload : payload.toString("utf8"),
  ) as Stripe.Event;

  if (event.type === "account.updated") {
    const account = event.data?.object as Stripe.Account;
    if (account?.id) {
      const svc = req.scope.resolve(
        STRIPE_CONNECT_ACCOUNT_MODULE,
      ) as StripeConnectAccountModuleService;
      await svc.syncAccountStatus(account.id);
    }
  }

  res.status(200).json({ received: true });
}
