import { createHash } from "node:crypto";
import type MealPrepModuleService from "./service";
import { BillingError, requireBillingTestMode } from "./billing-contracts";
import type { AutopayProvider, SavedMethodProvider } from "./autopay-contracts";

/** Test harness only: no route, cron, subscriber or production registration. */
export async function dispatchTestMethodSetup(
  service: MealPrepModuleService,
  provider: SavedMethodProvider,
  setupId: string,
) {
  requireBillingTestMode();
  const { request, sessionId, complete } =
    await service.prepareTestMethodSetup(setupId);
  if (complete) return;
  const o = sessionId
    ? await provider.retrieveSetup(request, sessionId)
    : await provider.createSetup(request);
  await service.recordTestMethodSetup(setupId, o);
}
export async function dispatchTestAutopay(
  service: MealPrepModuleService,
  provider: AutopayProvider,
  attemptId: string,
) {
  requireBillingTestMode();
  const dispatch = await service.prepareTestAutopayDispatch(attemptId);
  if (dispatch.action === "complete") return;
  try {
    const o =
      dispatch.action === "retrieve"
        ? await provider.retrieve(dispatch.request, dispatch.intentId)
        : await provider.create(dispatch.request);
    await service.recordTestAutopayObservation(attemptId, o);
  } catch {
    await service.flagTestAutopayTransportFailure(attemptId);
    throw new BillingError("AUTOPAY_RECONCILIATION_REQUIRED");
  }
}
export async function prepareTestManualFallback(
  service: MealPrepModuleService,
  provider: AutopayProvider,
  attemptId: string,
) {
  requireBillingTestMode();
  const fallback = await service.prepareTestAutopayFallback(attemptId);
  if (!fallback || fallback.canceled) return;
  try {
    const o = await provider.cancel(fallback.request, fallback.intentId);
    await service.recordTestAutopayObservation(attemptId, o);
    if (!["canceled", "succeeded"].includes(o.state)) throw new Error();
  } catch {
    await service.flagTestAutopayTransportFailure(attemptId);
    throw new BillingError("AUTOPAY_RECONCILIATION_REQUIRED");
  }
}
export async function handleTestAutopayWebhook(
  service: MealPrepModuleService,
  provider: AutopayProvider,
  raw: Buffer,
  signature: string,
) {
  requireBillingTestMode();
  if (!Buffer.isBuffer(raw) || raw.length > 1024 * 1024)
    throw new BillingError("INVALID_WEBHOOK");
  const e = provider.verify(raw, signature);
  const { request } = await service.readTestAutopayRequest(e.attemptId);
  if (e.accountId !== request.accountId)
    throw new BillingError("PROVIDER_MISMATCH");
  const o = await provider.retrieve(request, e.intentId);
  return service.recordTestAutopayObservation(e.attemptId, o, {
    eventId: e.eventId,
    accountId: e.accountId,
    payloadHash: createHash("sha256").update(raw).digest("hex"),
  });
}
export interface TestTimedNotificationSink {
  // A production adapter must durably deduplicate this key, including timeout after acceptance.
  // Customer access/link construction (D10) remains a release gate. No real email sink exists.
  send(message: {
    billId: string;
    subjectId: string;
    kind: "unpaid_reminder" | "autopay_fallback";
    idempotencyKey: string;
  }): Promise<void>;
}
export async function dispatchTestTimedNotification(
  service: MealPrepModuleService,
  sink: TestTimedNotificationSink,
  notificationId: string,
) {
  requireBillingTestMode();
  const claim = await service.claimTestTimedNotification(notificationId);
  if (!claim) return;
  if (
    !(await service.authorizeTestTimedNotification(
      notificationId,
      claim.dispatchId,
    ))
  )
    return;
  try {
    await sink.send({
      billId: claim.billId,
      subjectId: claim.subjectId,
      kind: claim.kind,
      idempotencyKey: claim.idempotencyKey,
    });
  } catch {
    await service.finishTestTimedNotification(
      notificationId,
      claim.dispatchId,
      "retry",
    );
    throw new BillingError("NOTIFICATION_RETRY_REQUIRED");
  }
  await service.finishTestTimedNotification(
    notificationId,
    claim.dispatchId,
    "sent",
  );
}
