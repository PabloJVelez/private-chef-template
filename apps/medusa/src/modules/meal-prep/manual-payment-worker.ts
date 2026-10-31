import { createHash } from "node:crypto";
import type MealPrepModuleService from "./service";
import {
  BillingError,
  requireBillingTestMode,
  type ManualPaymentProvider,
} from "./billing-contracts";

/** No scheduler/HTTP registration. Persistence commits before all external effects. */
export async function dispatchTestManualPayment(
  service: MealPrepModuleService,
  provider: ManualPaymentProvider,
  attemptId: string,
) {
  requireBillingTestMode();
  const { request, sessionId } =
    await service.prepareTestPaymentDispatch(attemptId);
  try {
    const observation = sessionId
      ? await provider.retrieve(request, sessionId)
      : await provider.create(request);
    await service.recordTestPaymentObservation(attemptId, observation);
  } catch (error) {
    await service.flagTestPaymentTransportFailure(attemptId);
    // Do not persist/log provider errors: they may contain customer data or URLs.
    throw new BillingError("PAYMENT_RECONCILIATION_REQUIRED");
  }
}
export async function handleTestPaymentWebhook(
  service: MealPrepModuleService,
  provider: ManualPaymentProvider,
  raw: Buffer,
  signature: string,
) {
  requireBillingTestMode();
  if (!Buffer.isBuffer(raw) || raw.length > 1024 * 1024)
    throw new BillingError("INVALID_WEBHOOK");
  // Authenticate original bytes before reading any private record or making provider calls.
  const event = provider.verify(raw, signature);
  const request = await service.readTestPaymentRequest(event.attemptId);
  if (event.accountId !== request.accountId)
    throw new BillingError("PROVIDER_MISMATCH");
  // Event ordering is not authoritative. Retrieve current provider state instead.
  const observation = await provider.retrieve(request, event.sessionId);
  return service.recordTestPaymentObservation(event.attemptId, observation, {
    eventId: event.eventId,
    accountId: event.accountId,
    payloadHash: createHash("sha256").update(raw).digest("hex"),
  });
}
export interface TestPaymentNotificationSink {
  // The D10 access-link and real email adapter are deliberately absent. The receiver
  // must deduplicate this key across retries, including timeout after delivery.
  send(input: {
    billId: string;
    subjectId: string;
    idempotencyKey: string;
  }): Promise<void>;
}
export async function dispatchTestPaymentNotification(
  service: MealPrepModuleService,
  sink: TestPaymentNotificationSink,
  billId: string,
) {
  requireBillingTestMode();
  const message = await service.prepareTestPaymentNotification(billId);
  if (!message) return;
  try {
    await sink.send(message);
  } catch {
    await service.finishTestPaymentNotification(billId, false);
    throw new BillingError("NOTIFICATION_RETRY_REQUIRED");
  }
  await service.finishTestPaymentNotification(billId, true);
}
