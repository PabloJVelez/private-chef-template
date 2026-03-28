import { defineWidgetConfig } from '@medusajs/admin-sdk';
import type { HttpTypes } from '@medusajs/types';
import { Container, Heading, Text } from '@medusajs/ui';
import { useQuery } from '@tanstack/react-query';
import { formatFromSmallestUnit, getSmallestUnit } from '../../modules/stripe-connect/utils/get-smallest-unit';
import { sdk } from '../../sdk';

const STRIPE_CONNECT_PP = 'pp_stripe-connect_stripe-connect';

type StripeConnectPaymentRow = {
  provider_id?: string;
  data?: Record<string, unknown>;
  amount?: number;
};

function parseNumericSmallest(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === 'string' && value !== '') {
    const n = Number(value);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

function extractPlatformCommission(
  order: HttpTypes.AdminOrder | undefined,
  currencyCode: string,
): {
  show: boolean;
  feeSmallest: number | null;
  grossSmallest: number | null;
  passStripeFeeToChef: boolean;
  stripeProcessingEstimateSmallest: number | null;
} {
  const collections = order?.payment_collections;
  if (!collections?.length) {
    return {
      show: false,
      feeSmallest: null,
      grossSmallest: null,
      passStripeFeeToChef: false,
      stripeProcessingEstimateSmallest: null,
    };
  }

  for (const col of collections) {
    const payments = (col as unknown as Record<string, unknown>).payments as StripeConnectPaymentRow[] | undefined;
    if (!payments?.length) continue;

    for (const payment of payments) {
      if (payment.provider_id !== STRIPE_CONNECT_PP) continue;

      const data = payment.data;
      const feeSmallest = parseNumericSmallest(data?.application_fee_amount);
      const passStripeFeeToChef = data?.pass_stripe_fee_to_chef === true;
      const stripeProcessingEstimateSmallest = parseNumericSmallest(data?.stripe_processing_fee_estimate);

      const fromStripePi = parseNumericSmallest(data?.amount);
      const fromOrderTotal =
        typeof order?.total === 'number' && Number.isFinite(order.total)
          ? getSmallestUnit(order.total, currencyCode)
          : null;
      const fromPaymentMajor =
        typeof payment.amount === 'number' && Number.isFinite(payment.amount)
          ? getSmallestUnit(payment.amount, currencyCode)
          : null;

      const grossSmallest = fromStripePi ?? fromPaymentMajor ?? fromOrderTotal;

      return {
        show: true,
        feeSmallest,
        grossSmallest,
        passStripeFeeToChef,
        stripeProcessingEstimateSmallest,
      };
    }
  }

  return {
    show: false,
    feeSmallest: null,
    grossSmallest: null,
    passStripeFeeToChef: false,
    stripeProcessingEstimateSmallest: null,
  };
}

function BreakdownRow({
  label,
  sublabel,
  value,
  valueClassName,
  valueSize = 'small',
  valueWeight = 'plus',
}: {
  label: string;
  sublabel?: string | null;
  value: string;
  valueClassName?: string;
  valueSize?: 'small' | 'large';
  valueWeight?: 'regular' | 'plus';
}) {
  return (
    <div className="flex items-baseline justify-between gap-4">
      <div className="min-w-0">
        <Text className="text-ui-fg-muted" size="small">
          {label}
        </Text>
        {sublabel ? (
          <Text className="text-ui-fg-muted" size="xsmall">
            {sublabel}
          </Text>
        ) : null}
      </div>
      <Text className={valueClassName ?? 'text-ui-fg-base tabular-nums'} size={valueSize} weight={valueWeight}>
        {value}
      </Text>
    </div>
  );
}

const OrderCommissionWidget = ({ data }: { data: HttpTypes.AdminOrder }) => {
  const {
    data: res,
    isLoading,
    isError,
  } = useQuery({
    queryKey: ['admin-order-platform-commission', data.id],
    queryFn: async () =>
      sdk.admin.order.retrieve(data.id, {
        fields:
          'id,currency_code,total,*payment_collections.payments.provider_id,*payment_collections.payments.data,*payment_collections.payments.amount',
      }),
    enabled: Boolean(data.id),
  });

  if (isLoading) {
    return null;
  }

  const order = !isError && res?.order ? res.order : data;
  const currency = order.currency_code || 'usd';
  const { show, feeSmallest, grossSmallest, passStripeFeeToChef, stripeProcessingEstimateSmallest } =
    extractPlatformCommission(order, currency);

  if (!show) {
    return null;
  }

  const hasGross = typeof grossSmallest === 'number' && grossSmallest > 0;
  const feeIsKnown = typeof feeSmallest === 'number' && Number.isFinite(feeSmallest);
  const showStripeFeesRow =
    passStripeFeeToChef &&
    typeof stripeProcessingEstimateSmallest === 'number' &&
    Number.isFinite(stripeProcessingEstimateSmallest) &&
    stripeProcessingEstimateSmallest > 0 &&
    feeIsKnown;

  const platformNetSmallest =
    showStripeFeesRow && feeIsKnown && typeof feeSmallest === 'number' && stripeProcessingEstimateSmallest !== null
      ? Math.max(0, feeSmallest - stripeProcessingEstimateSmallest)
      : feeSmallest;

  const platformNetIsKnown = typeof platformNetSmallest === 'number' && Number.isFinite(platformNetSmallest);

  let takeHomeSmallest: number | null = null;
  if (grossSmallest !== null && feeIsKnown && typeof feeSmallest === 'number' && grossSmallest >= feeSmallest) {
    takeHomeSmallest = grossSmallest - feeSmallest;
  }

  return (
    <Container className="divide-y p-0">
      <div className="flex flex-col gap-3 px-6 py-4">
        <Heading level="h2">Payout summary</Heading>

        <div className="flex flex-col gap-3">
          {hasGross && grossSmallest !== null ? (
            <>
              <BreakdownRow label="Charged to customer" value={formatFromSmallestUnit(grossSmallest, currency)} />

              {showStripeFeesRow && stripeProcessingEstimateSmallest !== null ? (
                <BreakdownRow
                  label="Stripe processing fees"
                  value={`−${formatFromSmallestUnit(stripeProcessingEstimateSmallest, currency)}`}
                  valueClassName="text-ui-fg-muted tabular-nums"
                  valueWeight="plus"
                />
              ) : null}

              <BreakdownRow
                label="Platform commission"
                value={platformNetIsKnown ? `−${formatFromSmallestUnit(platformNetSmallest, currency)}` : '—'}
                valueClassName="text-ui-fg-muted tabular-nums"
                valueWeight={platformNetIsKnown ? 'plus' : 'regular'}
              />

              <div className="border-ui-border-base border-t pt-3">
                <BreakdownRow
                  label="Chef take-home"
                  value={takeHomeSmallest !== null ? formatFromSmallestUnit(takeHomeSmallest, currency) : '—'}
                  valueSize={takeHomeSmallest !== null ? 'large' : 'small'}
                  valueWeight={takeHomeSmallest !== null ? 'plus' : 'regular'}
                />
                {takeHomeSmallest === null && grossSmallest !== null ? (
                  <Text className="text-ui-fg-muted mt-1" size="xsmall">
                    Add platform commission on the payment to calculate take-home.
                  </Text>
                ) : null}
              </div>
            </>
          ) : (
            <Text className="text-ui-fg-muted" size="small">
              No charge total available for this order.
            </Text>
          )}
        </div>
      </div>
    </Container>
  );
};

export const config = defineWidgetConfig({
  zone: 'order.details.side.before',
});

export default OrderCommissionWidget;
