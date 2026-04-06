/**
 * Stripe Connect payment row shapes for platform fee / chef payout breakdown on orders.
 *
 * With direct charges, Stripe fees are visible in the chef's Express Dashboard,
 * so the admin only shows: Charged to customer, Platform commission, Chef take-home.
 */
import type { HttpTypes } from '@medusajs/types';
import { getSmallestUnit } from '../modules/stripe-connect/utils/get-smallest-unit';

/** Canonical Medusa payment provider id for this module (medusa-config `id` is `stripe-connect`). */
export const STRIPE_CONNECT_PP = 'pp_stripe-connect_stripe-connect';

/** Normalize provider ids: casing, hyphens vs underscores (Admin UI may show mixed case via `capitalize`). */
function normalizeProviderIdForCompare(id: string): string {
  return id.toLowerCase().replace(/[^a-z0-9]/g, '');
}

const NORMALIZED_STRIPE_CONNECT_PP = normalizeProviderIdForCompare(STRIPE_CONNECT_PP);

export function isStripeConnectProviderId(providerId: string | null | undefined): boolean {
  if (!providerId || typeof providerId !== 'string') return false;
  return normalizeProviderIdForCompare(providerId) === NORMALIZED_STRIPE_CONNECT_PP;
}

/** Same flattening as dashboard `getPaymentsFromOrder` — keeps payout logic aligned with the Payments card. */
export function flattenOrderPayments(order: HttpTypes.AdminOrder | undefined): Array<{
  provider_id?: string;
  data?: unknown;
  amount?: unknown;
}> {
  const collections = order?.payment_collections;
  if (!collections?.length) return [];
  return collections.flatMap((col) => col.payments ?? []).filter(Boolean);
}

function paymentDataAsRecord(data: unknown): Record<string, unknown> | undefined {
  if (data == null) return undefined;
  if (typeof data === 'string') {
    try {
      const parsed: unknown = JSON.parse(data);
      if (typeof parsed === 'object' && parsed !== null) return parsed as Record<string, unknown>;
    } catch {
      return undefined;
    }
    return undefined;
  }
  if (typeof data === 'object') return data as Record<string, unknown>;
  return undefined;
}

export function parseNumericSmallest(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === 'string' && value !== '') {
    const n = Number(value);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

export function extractPlatformCommission(
  order: HttpTypes.AdminOrder | undefined,
  currencyCode: string,
): {
  show: boolean;
  feeSmallest: number | null;
  grossSmallest: number | null;
} {
  const payments = flattenOrderPayments(order);
  if (!payments.length) {
    return {
      show: false,
      feeSmallest: null,
      grossSmallest: null,
    };
  }

  for (const payment of payments) {
    if (!isStripeConnectProviderId(payment.provider_id)) continue;

    const data = paymentDataAsRecord(payment.data);
    const feeSmallest = parseNumericSmallest(data?.application_fee_amount);

    const fromStripePi = parseNumericSmallest(data?.amount);
    const orderTotalMajor = parseNumericSmallest(order?.total as unknown);
    const fromOrderTotal =
      orderTotalMajor !== null ? getSmallestUnit(orderTotalMajor, currencyCode) : null;
    const paymentMajor = parseNumericSmallest(payment.amount);
    const fromPaymentMajor =
      paymentMajor !== null ? getSmallestUnit(paymentMajor, currencyCode) : null;

    const grossSmallest = fromStripePi ?? fromPaymentMajor ?? fromOrderTotal;

    return {
      show: true,
      feeSmallest,
      grossSmallest,
    };
  }

  return {
    show: false,
    feeSmallest: null,
    grossSmallest: null,
  };
}
