import type { MedusaContainer } from '@medusajs/framework/types';
import { ContainerRegistrationKeys } from '@medusajs/framework/utils';
import { runPostEventTicketPaymentCapture } from '../workflows/post-event-capture-ticket-payments';

/**
 * Daily at 12:05 AM — capture authorized payments for chef events past requestedDate + 24h.
 * Runs once/day since events are date-based; no benefit to hourly polling.
 */
export default async function postEventCaptureTicketPaymentsJob(container: MedusaContainer) {
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER);
  const result = await runPostEventTicketPaymentCapture(container);
  if (result.capturesAttempted > 0 || result.eventsScanned > 0) {
    logger.info(
      `[job:post-event-capture-tickets] scanned ${result.eventsScanned} eligible event(s), ${result.capturesAttempted} capture(s) attempted`,
    );
  }
}

export const config = {
  name: 'post-event-capture-ticket-payments',
  schedule: '5 0 * * *',
};
