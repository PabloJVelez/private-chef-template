import { StoreCart, StoreCartShippingOption } from '@medusajs/types';

/**
 * Check if a shipping option represents digital delivery ($0, name contains "digital").
 */
export function isDigitalShippingOption(option: StoreCartShippingOption): boolean {
  return option.amount === 0 && option.name.toLowerCase().includes('digital');
}

/**
 * Check if every item in the cart is a digital product.
 * Uses two signals from the line item snapshot:
 *  - requires_shipping === false (set on inventory items for digital products)
 *  - variant_sku starts with EVENT- (convention for event ticket products)
 */
export function hasOnlyDigitalItems(cart: StoreCart | null): boolean {
  if (!cart || !cart.items?.length) return false;

  return cart.items.every((item) => {
    const lineItem = item as unknown as Record<string, unknown>;
    if (lineItem.requires_shipping === false) return true;
    const sku = lineItem.variant_sku;
    return typeof sku === 'string' && sku.startsWith('EVENT-');
  });
}

/**
 * Check if a cart contains only digital products.
 *
 * Two detection paths:
 *  1. Shipping options already filtered to a single free digital option (fast path)
 *  2. All cart items are digital AND at least one digital shipping option exists
 */
export function isDigitalOnlyCart(cart: StoreCart | null, shippingOptions: StoreCartShippingOption[]): boolean {
  if (!cart || !cart.items?.length) return false;

  if (shippingOptions.length === 1 && isDigitalShippingOption(shippingOptions[0])) {
    return true;
  }

  if (hasOnlyDigitalItems(cart)) {
    return shippingOptions.some(isDigitalShippingOption);
  }

  return false;
}

/**
 * Check if a cart requires a shipping address (inverse of digital-only).
 */
export function requiresShippingAddress(cart: StoreCart | null, shippingOptions: StoreCartShippingOption[]): boolean {
  return !isDigitalOnlyCart(cart, shippingOptions);
}

/**
 * For digital-only carts, strip out physical shipping options so
 * downstream components (delivery method, order summary) only see
 * the free digital delivery option.
 */
export function filterShippingOptionsForCart(
  cart: StoreCart | null,
  shippingOptions: StoreCartShippingOption[],
): StoreCartShippingOption[] {
  if (!hasOnlyDigitalItems(cart)) return shippingOptions;

  const digitalOptions = shippingOptions.filter(isDigitalShippingOption);
  return digitalOptions.length > 0 ? digitalOptions : shippingOptions;
}
