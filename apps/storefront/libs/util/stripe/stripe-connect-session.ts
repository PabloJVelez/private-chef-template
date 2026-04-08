/** Medusa payment provider id for the Stripe Connect (direct charges) module */
export const STRIPE_CONNECT_PROVIDER_ID = 'pp_stripe-connect_stripe-connect';

type PaymentSessionLike = {
  provider_id?: string;
  status?: string;
  data?: Record<string, unknown>;
};

/**
 * Direct-charge PaymentIntents live on the connected account. The storefront must call
 * `loadStripe(pk, { stripeAccount })` using `data.connected_account_id`. Old pending sessions
 * may have `client_secret` but omit `connected_account_id`, which breaks Elements (400 on
 * `/v1/elements/sessions`) until the session is refreshed.
 */
export function isStaleStripeConnectPaymentSession(session: PaymentSessionLike | undefined): boolean {
  if (!session || session.status !== 'pending') return false;
  if (session.provider_id !== STRIPE_CONNECT_PROVIDER_ID) return false;

  const data = session.data ?? {};
  const clientSecret = data.client_secret;
  const connectedId = data.connected_account_id;

  const hasClientSecret = typeof clientSecret === 'string' && clientSecret.length > 0;
  const hasValidConnectedAccount =
    typeof connectedId === 'string' && connectedId.length > 0 && connectedId.startsWith('acct_');

  return hasClientSecret && !hasValidConnectedAccount;
}
