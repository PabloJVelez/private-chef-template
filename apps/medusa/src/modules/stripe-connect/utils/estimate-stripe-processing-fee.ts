/**
 * Estimated Stripe card processing fee (same formula as application-fee gross-up).
 * Used by the payment provider and kept in sync for admin payout breakdown.
 */
export interface StripeFeeEstimateParams {
  stripeFeePercent: number;
  stripeFeeFlatCents: number;
}

export function estimateStripeProcessingFee(
  amountSmallest: number,
  params: StripeFeeEstimateParams,
): number {
  return Math.round(amountSmallest * (params.stripeFeePercent / 100)) + params.stripeFeeFlatCents;
}
