/**
 * Stripe Connect payment provider types.
 * Options passed from medusa-config (env); config is normalized for internal use.
 */

/** Fee mode per product type: per_unit = fixed cents per item, percent = percentage of line total. */
export type PlatformFeeMode = "per_unit" | "percent";

export interface StripeConnectProviderOptions {
  apiKey: string;
  /** When true, use destination charges + application fee (requires connectedAccountId / DB account). */
  useStripeConnect?: boolean;
  /** Legacy Stripe Connect connected account id (acct_xxx). When DB-backed onboarding is used, this may be omitted. */
  connectedAccountId?: string;
  /** Platform fee percentage (e.g. 5 for 5%). Default 5. Used when mode is percent or as fallback when no line data. */
  feePercent?: number;
  /** When true, refunds include application fee refund. Default false (platform keeps fee). */
  refundApplicationFee?: boolean;
  /** Optional: pass Stripe processing fee to connected account (gross-up application fee). */
  passStripeFeeToChef?: boolean;
  /** Stripe fee % for gross-up when passStripeFeeToChef is true. Default 2.9. */
  stripeFeePercent?: number;
  /** Stripe flat fee in cents for gross-up. Default 30. */
  stripeFeeFlatCents?: number;
  /** Webhook signing secret for signature verification. */
  webhookSecret?: string;
  /** Enable Stripe automatic_payment_methods. Default true. */
  automaticPaymentMethods?: boolean;
  /** capture_method: "automatic" | "manual". Default "automatic". */
  captureMethod?: "automatic" | "manual";
  /**
   * When true, commission is per unit (events/products) using cart lines.
   * When false, commission is per cart (single percentage of cart total). Default false.
   */
  feePerUnitBased?: boolean;
  /** Fee mode for events (e.g. EVENT-* SKU). Default "percent". Only used when feePerUnitBased is true. */
  feeModeEvents?: PlatformFeeMode;
  /** Fee mode for products/other. Default "percent". Only used when feePerUnitBased is true. */
  feeModeProducts?: PlatformFeeMode;
  /** Fixed fee in cents per event when feeModeEvents is per_unit. */
  feePerEventCents?: number;
  /** Fixed fee in cents per product when feeModeProducts is per_unit. */
  feePerProductCents?: number;
  /** Percentage for events when feeModeEvents is percent. Defaults to feePercent if unset. */
  feePercentEvents?: number;
  /** Percentage for products when feeModeProducts is percent. Defaults to feePercent if unset. */
  feePercentProducts?: number;
}

export interface StripeConnectConfig {
  apiKey: string;
  useStripeConnect: boolean;
  /** From env (legacy) or resolved from DB at runtime when useStripeConnect is true. */
  connectedAccountId: string;
  feePercent: number;
  refundApplicationFee: boolean;
  passStripeFeeToChef: boolean;
  stripeFeePercent: number;
  stripeFeeFlatCents: number;
  webhookSecret?: string;
  automaticPaymentMethods: boolean;
  captureMethod: "automatic" | "manual";
  /** When true, use per-line fee (event/product). When false, always use cart-level percentage. */
  feePerUnitBased: boolean;
  feeModeEvents: PlatformFeeMode;
  feeModeProducts: PlatformFeeMode;
  feePerEventCents: number;
  feePerProductCents: number;
  feePercentEvents: number;
  feePercentProducts: number;
}

export interface StripeConnectPaymentData {
  id: string;
  client_secret?: string;
  status: string;
  amount: number;
  currency: string;
  connected_account_id?: string;
  application_fee_amount?: number;
}

/** Line item for platform fee calculation. unit_price_cents = price per unit in smallest currency unit. */
export interface PlatformFeeLineItem {
  sku: string;
  quantity: number;
  unit_price_cents: number;
}

