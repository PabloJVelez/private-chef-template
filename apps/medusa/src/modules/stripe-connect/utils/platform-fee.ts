/**
 * Platform fee calculation from line items (event vs product by SKU).
 * Event = SKU starts with EVENT-; else product. Used for Stripe Connect application_fee_amount.
 *
 * Future improvement: Prefer product tag or custom attribute (e.g. product_type: event | product)
 * instead of inferring from SKU prefix. See clarification packet and seed scripts.
 */
import type { PlatformFeeLineItem, StripeConnectConfig } from "../types";

export function isEvent(sku: string): boolean {
  return typeof sku === "string" && sku.startsWith("EVENT-");
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
    const isEventLine = isEvent(line.sku ?? "");

    if (isEventLine) {
      if (config.feeModeEvents === "per_unit") {
        totalCents += (config.feePerEventCents ?? 0) * line.quantity;
      } else {
        totalCents += Math.round(
          (lineTotalCents *
            (config.feePercentEvents ?? config.feePercent)) /
            100,
        );
      }
    } else {
      if (config.feeModeProducts === "per_unit") {
        totalCents += (config.feePerProductCents ?? 0) * line.quantity;
      } else {
        totalCents += Math.round(
          (lineTotalCents *
            (config.feePercentProducts ?? config.feePercent)) /
            100,
        );
      }
    }
  }
  return totalCents;
}

