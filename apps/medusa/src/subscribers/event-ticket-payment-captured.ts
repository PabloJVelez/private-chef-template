import { ContainerRegistrationKeys, PaymentEvents } from '@medusajs/framework/utils';
import type { SubscriberArgs, SubscriberConfig } from '@medusajs/medusa';
import { fulfillEventTicketLinesForPayment } from '../workflows/fulfill-event-ticket-lines';

/** Emitted by `capturePaymentWorkflow` (`emitEventStep` with `PaymentEvents.CAPTURED`). */
interface PaymentCapturedPayload {
  id: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function isPaymentCapturedPayload(data: unknown): data is PaymentCapturedPayload {
  return isRecord(data) && typeof data.id === 'string' && data.id.length > 0;
}

/**
 * Auto-fulfill EVENT-* ticket lines when payment is captured (manual admin capture,
 * API capture, or post-event scheduled capture).
 */
export default async function eventTicketPaymentCapturedHandler({
  event,
  container,
}: SubscriberArgs<PaymentCapturedPayload>) {
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER);

  if (!isPaymentCapturedPayload(event.data)) {
    logger.warn(`[event-ticket-payment-captured] Ignoring event: invalid payload (expected { id: string })`);
    return;
  }

  const paymentId = event.data.id;

  try {
    const { orderId, fulfilled } = await fulfillEventTicketLinesForPayment(container, paymentId);
    if (orderId && !fulfilled) {
      logger.debug(`[event-ticket-payment-captured] Payment ${paymentId} order ${orderId}: no ticket lines to fulfill`);
    }
  } catch (e) {
    logger.error(`[event-ticket-payment-captured] Payment ${paymentId}: ${e instanceof Error ? e.message : String(e)}`);
  }
}

export const config: SubscriberConfig = {
  event: PaymentEvents.CAPTURED,
};
