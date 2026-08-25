/** Medusa payment provider id for the Stripe Connect (direct charges) module */
export const STRIPE_CONNECT_PROVIDER_ID = 'pp_stripe-connect_stripe-connect';

type PaymentSessionLike = {
  provider_id?: string;
  status?: string;
  data?: Record<string, unknown>;
};

export function getStripeConnectConnectedAccountId(session: PaymentSessionLike | undefined): string | undefined {
  const connectedId = session?.data?.connected_account_id;
  return typeof connectedId === 'string' && connectedId.startsWith('acct_') ? connectedId : undefined;
}

export function getStripeConnectClientSecret(session: PaymentSessionLike | undefined): string | undefined {
  const clientSecret = session?.data?.client_secret;
  return typeof clientSecret === 'string' && clientSecret.length > 0 ? clientSecret : undefined;
}

export function isStripeConnectPaymentSession(session: PaymentSessionLike | undefined): boolean {
  return session?.provider_id === STRIPE_CONNECT_PROVIDER_ID;
}

export function isUsableStripeConnectPaymentSession(session: PaymentSessionLike | undefined): boolean {
  if (!session || session.status !== 'pending') return false;
  if (!isStripeConnectPaymentSession(session)) return false;

  return !!getStripeConnectClientSecret(session) && !!getStripeConnectConnectedAccountId(session);
}

/**
 * Direct-charge PaymentIntents live on the connected account. The storefront must call
 * `loadStripe(pk, { stripeAccount })` using `data.connected_account_id`. Old pending sessions
 * may have `client_secret` but omit `connected_account_id`, which breaks Elements (400 on
 * `/v1/elements/sessions`) until the session is refreshed.
 */
export function isStaleStripeConnectPaymentSession(session: PaymentSessionLike | undefined): boolean {
  if (!session || session.status !== 'pending') return false;
  if (!isStripeConnectPaymentSession(session)) return false;

  return !isUsableStripeConnectPaymentSession(session);
}
