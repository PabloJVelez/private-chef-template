import { useCheckout } from '@app/hooks/useCheckout';
import { useEnv } from '@app/hooks/useEnv';
import { Elements } from '@stripe/react-stripe-js';
import { StripeElementsOptions, loadStripe } from '@stripe/stripe-js';
import { FC, PropsWithChildren, useMemo } from 'react';

export interface StripeElementsProviderProps extends PropsWithChildren {
  options?: StripeElementsOptions;
}

export const StripeElementsProvider: FC<StripeElementsProviderProps> = ({ options, children }) => {
  const { env } = useEnv();
  const { cart } = useCheckout();

  const stripeSession = useMemo(
    () => cart?.payment_collection?.payment_sessions?.find((s) => s.provider_id === 'pp_stripe-connect_stripe-connect'),
    [cart?.payment_collection?.payment_sessions],
  ) as unknown as {
    data: { client_secret: string; connected_account_id?: string };
  };

  const connectedAccountId = stripeSession?.data?.connected_account_id;

  const stripePromise = useMemo(
    () =>
      env.STRIPE_PUBLIC_KEY
        ? loadStripe(env.STRIPE_PUBLIC_KEY, connectedAccountId ? { stripeAccount: connectedAccountId } : undefined)
        : null,
    [env.STRIPE_PUBLIC_KEY, connectedAccountId],
  );

  const clientSecret = stripeSession?.data?.client_secret as string;

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
