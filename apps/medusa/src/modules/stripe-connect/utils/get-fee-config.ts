/**
 * Platform fee configuration read from env (PLATFORM_FEE_*).
 * Used by the Stripe Connect provider so medusa-config only passes Connect options.
 *
 * This template generalizes the sibling project's tickets/bento model to events/products:
 * - EVENTS: typically items whose SKU starts with EVENT- (by default)
 * - PRODUCTS: all other items
 */
import type { PlatformFeeMode } from "../types";

export interface PlatformFeeConfigFromEnv {
  feePercent: number;
  feePerUnitBased: boolean;
  feeModeEvents: PlatformFeeMode;
  feeModeProducts: PlatformFeeMode;
  feePerEventCents: number;
  feePerProductCents: number;
  feePercentEvents: number;
  feePercentProducts: number;
}

export function getPlatformFeeConfigFromEnv(): PlatformFeeConfigFromEnv {
  const feePercent = parseInt(process.env.PLATFORM_FEE_PERCENT || "5", 10);
  const feePerUnitBased = process.env.PLATFORM_FEE_PER_UNIT_BASED === "true";

  const feeModeEvents = (process.env.PLATFORM_FEE_MODE_EVENTS ||
    "percent") as PlatformFeeMode;
  const feeModeProducts = (process.env.PLATFORM_FEE_MODE_PRODUCTS ||
    "percent") as PlatformFeeMode;

  const feePerEventCents = parseInt(
    process.env.PLATFORM_FEE_PER_EVENT_CENTS || "0",
    10,
  );
  const feePerProductCents = parseInt(
    process.env.PLATFORM_FEE_PER_PRODUCT_CENTS || "0",
    10,
  );

  const feePercentEvents =
    process.env.PLATFORM_FEE_PERCENT_EVENTS != null
      ? parseInt(process.env.PLATFORM_FEE_PERCENT_EVENTS, 10)
      : feePercent;
  const feePercentProducts =
    process.env.PLATFORM_FEE_PERCENT_PRODUCTS != null
      ? parseInt(process.env.PLATFORM_FEE_PERCENT_PRODUCTS, 10)
      : feePercent;

  return {
    feePercent,
    feePerUnitBased,
    feeModeEvents,
    feeModeProducts,
    feePerEventCents,
    feePerProductCents,
    feePercentEvents,
    feePercentProducts,
  };
}

