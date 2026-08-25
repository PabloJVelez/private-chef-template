import { useCheckout } from '@app/hooks/useCheckout';
import { useEnv } from '@app/hooks/useEnv';
import {
  STRIPE_CONNECT_PROVIDER_ID,
  getStripeConnectClientSecret,
  getStripeConnectConnectedAccountId,
} from '@libs/util/stripe/stripe-connect-session';
import { Elements } from '@stripe/react-stripe-js';
import { StripeElementsOptions, loadStripe } from '@stripe/stripe-js';
import { FC, PropsWithChildren, useEffect, useMemo } from 'react';

export interface StripeElementsProviderProps extends PropsWithChildren {
  options?: StripeElementsOptions;
}

export const StripeElementsProvider: FC<StripeElementsProviderProps> = ({ options, children }) => {
  const { env } = useEnv();
  const { cart } = useCheckout();

  const stripeSession = useMemo(
    () => cart?.payment_collection?.payment_sessions?.find((s) => s.provider_id === STRIPE_CONNECT_PROVIDER_ID),
    [cart?.payment_collection?.payment_sessions],
  );

  const connectedAccountId = getStripeConnectConnectedAccountId(stripeSession);

  const stripePromise = useMemo(
    () =>
      env.STRIPE_PUBLIC_KEY
        ? loadStripe(env.STRIPE_PUBLIC_KEY, connectedAccountId ? { stripeAccount: connectedAccountId } : undefined)
        : null,
    [env.STRIPE_PUBLIC_KEY, connectedAccountId],
  );

  const clientSecret = getStripeConnectClientSecret(stripeSession);

  useEffect(() => {
    if (clientSecret && !connectedAccountId) {
      console.warn(
        '[Stripe] Payment session has client_secret but missing connected_account_id. ' +
          'Direct-charge checkouts need a fresh payment session; reload checkout or clear the cart if this persists.',
      );
    }
  }, [clientSecret, connectedAccountId]);

  if (!stripeSession || !stripePromise || !clientSecret) return null;

  return (
    <Elements
      stripe={stripePromise}
      key={clientSecret}
      options={
        options ?? {
          clientSecret: clientSecret,
        }
      }
    >
      {children}
    </Elements>
  );
};
