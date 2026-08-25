import { CheckoutFlow } from '@app/components/checkout/CheckoutFlow';
import { CheckoutSidebar } from '@app/components/checkout/CheckoutSidebar';
import { Empty } from '@app/components/common/Empty/Empty';
import { Button } from '@app/components/common/buttons/Button';
import { CheckoutProvider } from '@app/providers/checkout-provider';
import ShoppingCartIcon from '@heroicons/react/24/outline/ShoppingCartIcon';
import { filterShippingOptionsForCart, hasOnlyDigitalItems, isDigitalShippingOption } from '@libs/util/cart/cart-helpers';
import { sdk } from '@libs/util/server/client.server';
import { getCartId, removeCartId } from '@libs/util/server/cookies.server';
import { ensureStripePaymentSession, retrieveCart, setShippingMethod } from '@libs/util/server/data/cart.server';
import { listCartPaymentProviders } from '@libs/util/server/data/payment.server';
import { STRIPE_CONNECT_PROVIDER_ID } from '@libs/util/stripe/stripe-connect-session';
import { CartDTO, StoreCart, StoreCartShippingOption, StorePaymentProvider } from '@medusajs/types';
import { BasePaymentSession } from '@medusajs/types/dist/http/payment/common';
import { LoaderFunctionArgs, redirect } from 'react-router';
import { Link, useLoaderData } from 'react-router';

const fetchShippingOptions = async (cartId: string) => {
  if (!cartId) return [];

  try {
    const { shipping_options } = await sdk.store.fulfillment.listCartOptions({
      cart_id: cartId,
    });
    return shipping_options;
  } catch (e) {
    console.error(e);
    return [];
  }
};

const findCheapestShippingOption = (shippingOptions: StoreCartShippingOption[]) => {
  return shippingOptions.reduce((cheapest, current) => {
    return cheapest.amount <= current.amount ? cheapest : current;
  }, shippingOptions[0]);
};

const ensureSelectedCartShippingMethod = async (request: Request, cart: StoreCart) => {
  const shippingOptions = await fetchShippingOptions(cart.id);
  if (shippingOptions.length === 0) return;

  // For digital-only carts, always ensure the digital delivery option is selected
  if (hasOnlyDigitalItems(cart)) {
    const digitalOption = shippingOptions.find(isDigitalShippingOption);
    if (digitalOption) {
      const currentMethod = cart.shipping_methods?.[0];
      if (!currentMethod || currentMethod.shipping_option_id !== digitalOption.id) {
        await setShippingMethod(request, { cartId: cart.id, shippingOptionId: digitalOption.id });
      }
      return;
    }
  }

  // For non-digital carts, only auto-select if no method is already set
  if (cart.shipping_methods?.[0]) return;

  if (shippingOptions.length === 1) {
    await setShippingMethod(request, { cartId: cart.id, shippingOptionId: shippingOptions[0].id });
    return;
  }

  const cheapestShippingOption = findCheapestShippingOption(shippingOptions);
  if (cheapestShippingOption) {
    await setShippingMethod(request, { cartId: cart.id, shippingOptionId: cheapestShippingOption.id });
  }
};

export const loader = async ({
  request,
}: LoaderFunctionArgs): Promise<{
  cart: StoreCart | null;
  shippingOptions: StoreCartShippingOption[];
  paymentProviders: StorePaymentProvider[];
  activePaymentSession: BasePaymentSession | null;
}> => {
  const cartId = await getCartId(request.headers);

  if (!cartId) {
    return {
      cart: null,
      shippingOptions: [],
      paymentProviders: [],
      activePaymentSession: null,
    };
  }

  const cart = await retrieveCart(request).catch((e) => null);

  if (!cart) {
    throw redirect('/');
  }

  if ((cart as { completed_at?: string }).completed_at) {
    const headers = new Headers();
    await removeCartId(headers);

    throw redirect(`/`, { headers });
  }

  await ensureSelectedCartShippingMethod(request, cart);

  const [shippingOptions, paymentProviders] = await Promise.all([
    await fetchShippingOptions(cartId),
    (await listCartPaymentProviders(cart.region_id!)) as StorePaymentProvider[],
  ]);

  const cartWithPayment = paymentProviders.some((provider) => provider.id === STRIPE_CONNECT_PROVIDER_ID)
    ? await ensureStripePaymentSession(request, cart)
    : cart;
  const updatedCart = (await retrieveCart(request)) ?? cartWithPayment;
  const activePaymentSession =
    updatedCart.payment_collection?.payment_sessions?.find(
      (session) => session.status === 'pending' && session.provider_id === STRIPE_CONNECT_PROVIDER_ID,
    ) ?? null;

  return {
    cart: updatedCart,
    shippingOptions: filterShippingOptionsForCart(updatedCart, shippingOptions),
    paymentProviders: paymentProviders,
    activePaymentSession: activePaymentSession as BasePaymentSession,
  };
};

export default function CheckoutIndexRoute() {
  const { shippingOptions, paymentProviders, activePaymentSession, cart } = useLoaderData<typeof loader>();

  if (!cart || !cart.items?.length)
    return (
      <Empty
        icon={ShoppingCartIcon}
        title="No items in your cart."
        description="Add items to your cart"
        action={
          <Button variant="primary" as={(buttonProps) => <Link to="/products" {...buttonProps} />}>
            Start shopping
          </Button>
        }
      />
    );

  return (
    <CheckoutProvider
      data={{
        cart: cart as StoreCart | null,
        activePaymentSession: activePaymentSession,
        shippingOptions: shippingOptions,
        paymentProviders: paymentProviders,
      }}
    >
      <section>
        <div className="mx-auto max-w-2xl px-4 pb-8 pt-6 sm:px-6 sm:pb-16 sm:pt-8 lg:max-w-7xl lg:px-8 lg:pb-24 lg:pt-16">
          <div className="lg:grid lg:grid-cols-[4fr_3fr] lg:gap-x-12 xl:gap-x-16">
            <CheckoutFlow />
            <CheckoutSidebar />
          </div>
        </div>
      </section>
    </CheckoutProvider>
  );
}
