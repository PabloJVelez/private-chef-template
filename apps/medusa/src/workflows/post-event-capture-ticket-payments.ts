import type { MedusaContainer } from '@medusajs/framework/types';
import { ContainerRegistrationKeys } from '@medusajs/framework/utils';
import { capturePaymentWorkflow } from '@medusajs/medusa/core-flows';
import { CHEF_EVENT_MODULE } from '../modules/chef-event';
import type ChefEventModuleService from '../modules/chef-event/service';

const POST_EVENT_CAPTURE_DELAY_MS = 24 * 60 * 60 * 1000;
/** Only look back 7 days for uncaptured payments — avoids scanning all historical events. */
const LOOKBACK_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;
const STRIPE_CONNECT_PROVIDER_ID = 'pp_stripe-connect_stripe-connect';

type PaymentLike = {
  id: string;
  provider_id?: string | null;
  captured_at?: Date | string | null;
  canceled_at?: Date | string | null;
};

type OrderQueryRow = {
  id: string;
  payment_collections?: Array<{ payments?: PaymentLike[] }>;
};

/**
 * For chef events past requestedDate + 24h, capture authorized Stripe Connect payments
 * so `payment.captured` runs and ticket lines auto-fulfill.
 */
export async function runPostEventTicketPaymentCapture(
  container: MedusaContainer,
): Promise<{ eventsScanned: number; capturesAttempted: number }> {
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER);
  const query = container.resolve(ContainerRegistrationKeys.QUERY);
  const chefEventService = container.resolve(CHEF_EVENT_MODULE) as ChefEventModuleService;

  const now = Date.now();
  const captureEligibleBefore = new Date(now - POST_EVENT_CAPTURE_DELAY_MS);
  const lookbackStart = new Date(now - LOOKBACK_WINDOW_MS);

  const chefEvents = await chefEventService.listChefEvents({
    status: 'confirmed',
    requestedDate: { $lte: captureEligibleBefore, $gte: lookbackStart },
  } as Record<string, unknown>);

  let eventsScanned = 0;
  let capturesAttempted = 0;

  for (const ev of chefEvents) {
    const productId = ev.productId as string | null | undefined;
    if (!productId) continue;

    eventsScanned += 1;

    const { data: orderRows } = await query.graph({
      entity: 'order',
      fields: [
        'id',
        'items.product_id',
        'payment_collections.payments.id',
        'payment_collections.payments.provider_id',
        'payment_collections.payments.captured_at',
        'payment_collections.payments.canceled_at',
      ],
      filters: {
        items: { product_id: productId },
      } as Record<string, unknown>,
    });

    const orders = (orderRows ?? []) as OrderQueryRow[];

    for (const order of orders) {
      const collections = order.payment_collections ?? [];
      for (const col of collections) {
        const payments = col.payments ?? [];
        for (const payment of payments) {
          if (payment.provider_id !== STRIPE_CONNECT_PROVIDER_ID) continue;
          if (payment.canceled_at) continue;
          if (payment.captured_at) continue;

          try {
            await capturePaymentWorkflow(container).run({
              input: { payment_id: payment.id },
            });
            capturesAttempted += 1;
            logger.info(
              `[post-event-capture] Captured payment ${payment.id} for order ${order.id} (chef event product ${productId})`,
            );
          } catch (e) {
            logger.warn(
              `[post-event-capture] Skip payment ${payment.id} order ${order.id}: ${e instanceof Error ? e.message : String(e)}`,
            );
          }
        }
      }
    }
  }

  return { eventsScanned, capturesAttempted };
}
