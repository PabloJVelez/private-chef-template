/**
 * Platform fee calculation from line items (ticket vs bento by SKU).
 * Ticket = SKU starts with EVENT-; else bento. Used for Stripe Connect application_fee_amount.
 *
 * Future improvement: Prefer product tag or custom attribute (e.g. product_type: ticket | bento)
 * instead of inferring from SKU prefix. See clarification packet and seed scripts.
 */
import type { PlatformFeeLineItem, StripeConnectConfig } from '../types';

export function isTicket(sku: string): boolean {
  return typeof sku === 'string' && sku.startsWith('EVENT-');
}

/**
 * Computes platform fee in smallest currency unit from line items.
 */
export function calculatePlatformFeeFromLines(
  lines: PlatformFeeLineItem[],
  config: StripeConnectConfig,
): number {
  if (!lines.length) return 0;

  let totalCents = 0;
  for (const line of lines) {
    const lineTotalCents = line.unit_price_cents * line.quantity;
    const isTicketLine = isTicket(line.sku ?? '');

    if (isTicketLine) {
      if (config.feeModeTickets === 'per_unit') {
        totalCents += (config.feePerTicketCents ?? 0) * line.quantity;
      } else {
        totalCents += Math.round(
          (lineTotalCents * (config.feePercentTickets ?? config.feePercent)) / 100,
        );
      }
    } else {
      if (config.feeModeBento === 'per_unit') {
        totalCents += (config.feePerBoxCents ?? 0) * line.quantity;
      } else {
        totalCents += Math.round(
          (lineTotalCents * (config.feePercentBento ?? config.feePercent)) / 100,
        );
      }
    }
  }
  return totalCents;
}

