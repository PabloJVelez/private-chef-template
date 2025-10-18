import { StoreCart, StoreCartShippingOption } from '@medusajs/types';

/**
 * Check if a cart contains only digital products based on shipping options
 * Digital products typically have a "Digital Delivery" shipping option with $0 cost
 */
export function isDigitalOnlyCart(cart: StoreCart | null, shippingOptions: StoreCartShippingOption[]): boolean {
  if (!cart || !cart.items?.length) return false;
  
  // If there's only one shipping option and it's free (digital delivery), it's digital only
  if (shippingOptions.length === 1) {
    const option = shippingOptions[0];
    // Digital delivery typically has $0 cost and contains "digital" in the name
    return option.amount === 0 && option.name.toLowerCase().includes('digital');
  }
  
  return false;
}

/**
 * Check if a cart requires shipping address
 */
export function requiresShippingAddress(cart: StoreCart | null, shippingOptions: StoreCartShippingOption[]): boolean {
  return !isDigitalOnlyCart(cart, shippingOptions);
}

