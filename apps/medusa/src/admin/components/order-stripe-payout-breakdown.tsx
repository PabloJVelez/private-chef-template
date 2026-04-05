import type { HttpTypes } from '@medusajs/types';
import { Text } from '@medusajs/ui';
import { formatFromSmallestUnit } from '../../modules/stripe-connect/utils/get-smallest-unit';
import { extractPlatformCommission } from '../../lib/order-stripe-payout';

function BreakdownCostRow({
  label,
  sublabel,
  value,
  valueClassName,
}: {
  label: string;
  sublabel?: string | null;
  value: string;
  valueClassName?: string;
}) {
  return (
    <div className="grid grid-cols-3 items-center">
      <Text size="small" leading="compact" className="col-span-2 text-ui-fg-subtle">
        {label}
        {sublabel ? (
          <>
            <br />
            <span className="text-ui-fg-muted text-xs">{sublabel}</span>
          </>
        ) : null}
      </Text>
      <div className="text-right">
        <Text size="small" leading="compact" className={valueClassName ?? 'text-ui-fg-base'}>
          {value}
        </Text>
      </div>
    </div>
  );
}

type Props = {
  order: HttpTypes.AdminOrder;
};

/**
 * Stripe Connect payout rows inside the order Summary cost breakdown.
 * Shows: Charged to customer, Platform commission, Chef take-home.
 * Stripe processing fees are visible in the chef's Express Dashboard.
 */
export function OrderStripePayoutBreakdown({ order }: Props) {
  const currency = order.currency_code || 'usd';
  const { show, feeSmallest, grossSmallest } = extractPlatformCommission(order, currency);

  if (!show) {
    return null;
  }

  const hasGross = typeof grossSmallest === 'number' && grossSmallest > 0;
  const feeIsKnown = typeof feeSmallest === 'number' && Number.isFinite(feeSmallest);

  let takeHomeSmallest: number | null = null;
  if (grossSmallest !== null && feeIsKnown && typeof feeSmallest === 'number' && grossSmallest >= feeSmallest) {
    takeHomeSmallest = grossSmallest - feeSmallest;
  }

  if (!hasGross || grossSmallest === null) {
    return (
      <div className="text-ui-fg-subtle mt-2 flex flex-col gap-y-2 border-t border-dashed pt-2">
        <Text size="small" weight="plus" className="text-ui-fg-base">
          Payout
        </Text>
        <Text size="small" className="text-ui-fg-muted">
          No charge total available for this order.
        </Text>
      </div>
    );
  }

  return (
    <div className="text-ui-fg-subtle mt-2 flex flex-col gap-y-2 border-t border-dashed pt-2">
      <Text size="small" weight="plus" className="text-ui-fg-base">
        Payout
      </Text>
      <BreakdownCostRow label="Charged to customer" value={formatFromSmallestUnit(grossSmallest, currency)} />

      <BreakdownCostRow
        label="Platform commission"
        value={feeIsKnown ? `−${formatFromSmallestUnit(feeSmallest, currency)}` : '—'}
        valueClassName={feeIsKnown ? 'text-ui-fg-muted tabular-nums' : 'text-ui-fg-muted'}
      />

      <div className="border-ui-border-base grid grid-cols-3 items-center border-t pt-2">
        <Text size="small" weight="plus" leading="compact" className="text-ui-fg-base col-span-2">
          Chef take-home
        </Text>
        <div className="text-right">
          <Text
            size="small"
            weight="plus"
            leading="compact"
            className={takeHomeSmallest !== null ? 'text-ui-fg-base tabular-nums' : 'text-ui-fg-muted'}
          >
            {takeHomeSmallest !== null ? formatFromSmallestUnit(takeHomeSmallest, currency) : '—'}
          </Text>
        </div>
      </div>
      {takeHomeSmallest === null && grossSmallest !== null ? (
        <Text className="text-ui-fg-muted" size="xsmall">
          Add platform commission on the payment to calculate take-home.
        </Text>
      ) : null}
    </div>
  );
}
