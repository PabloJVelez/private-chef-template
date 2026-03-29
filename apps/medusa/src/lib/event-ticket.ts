/**
 * Event ticket line detection (chef-event products use EVENT-* SKUs).
 * Same prefix convention as Stripe Connect platform fees.
 */
import { isEvent } from '../modules/stripe-connect/utils/platform-fee';

export function isEventTicketSku(sku: string | null | undefined): boolean {
  return isEvent(sku ?? '');
}

export interface OrderLineLike {
  id: string;
  variant_sku?: string | null;
  quantity: number;
  detail?: { fulfilled_quantity?: number | null };
}

/**
 * Line items that are event tickets and still need fulfillment quantity.
 */
export function getUnfulfilledEventTicketLineItems(
  items: OrderLineLike[] | null | undefined,
): { id: string; quantity: number }[] {
  if (!items?.length) return [];

  const out: { id: string; quantity: number }[] = [];
  for (const item of items) {
    if (!isEventTicketSku(item.variant_sku)) continue;
    const fulfilled = item.detail?.fulfilled_quantity ?? 0;
    const open = item.quantity - fulfilled;
    if (open <= 0) continue;
    out.push({ id: item.id, quantity: open });
  }
  return out;
}
