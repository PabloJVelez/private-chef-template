import type { MedusaContainer, IProductModuleService, ILockingModule } from '@medusajs/framework/types';
import { Modules, MedusaError, TransactionStepStatus, OrchestrationUtils } from '@medusajs/framework/utils';
import { createPrivateEventTicketWorkflow } from '../workflows/create-private-event-ticket';
import { StepResponse } from '@medusajs/framework/workflows-sdk';

// Awaiting retries resume interrupted idempotent commands. No workflow timeout or hold expiry.
export const bookingStepConfig = { maxRetries: 3, retryInterval: 5, retryIntervalAwaiting: 60 };
export const eventProductExecution = (attemptId: string) => `ticket-${attemptId}`;

export function withEventProductLock<T>(
  container: MedusaContainer,
  attemptId: string,
  work: () => Promise<T>,
) {
  return container
    .resolve<ILockingModule>(Modules.LOCKING)
    .execute(`private-event-product-${attemptId}`, work, { timeout: 10 });
}

export function eventProductWorkflow(container: MedusaContainer) {
  return createPrivateEventTicketWorkflow(container);
}

/**
 * Medusa's native product write and its step checkpoint are separate commits. Only restore
 * that native step from creation-time ownership metadata; a handle/SKU never grants authority.
 * Caller holds the native per-attempt lock, so a slow original product writer cannot race recovery.
 */
export async function recoverEventProduct(container: MedusaContainer, attemptId: string, eventId: string) {
  const flow = eventProductWorkflow(container);
  let transaction;
  try {
    transaction = await flow.getRunningTransaction(eventProductExecution(attemptId));
  } catch (error) {
    if ((error as { type?: string }).type === MedusaError.Types.NOT_FOUND) return;
    throw error;
  }
  if (!transaction || transaction.hasFinished()) return;
  const step = Object.values(transaction.getFlow().steps).find(
    (step) => step.definition?.action === 'create-products',
  );
  if (step?.invoke.status !== TransactionStepStatus.WAITING) return;
  const productService = container.resolve<IProductModuleService>(Modules.PRODUCT);
  const products = await productService.listProducts(
    { external_id: eventProductExecution(attemptId) },
    { relations: ['options', 'options.values'] },
  );
  if (
    products.length !== 1 ||
    products[0].metadata?.acceptance_attempt !== attemptId ||
    products[0].metadata?.chef_event_id !== eventId
  )
    throw new Error(
      'Product creation outcome is ambiguous; keep protected time and inspect this native execution.',
    );
  await flow.registerStepSuccess({
    idempotencyKey: `create-private-event-ticket:${eventProductExecution(attemptId)}:create-products:invoke`,
    response: {
      __type: OrchestrationUtils.SymbolWorkflowWorkflowData,
      output: new StepResponse(
        products,
        products.map((product) => product.id),
      ).toJSON(),
    } as never,
  });
}

/** A lost step response must not turn product uncertainty into released time. */
export async function assertEventProductAbsent(
  container: MedusaContainer,
  attemptId: string,
  eventId: string,
) {
  const service = container.resolve<IProductModuleService>(Modules.PRODUCT);
  const products = await service.listProducts({ external_id: eventProductExecution(attemptId) }, { take: 1 });
  if (products.length)
    throw new Error('Correlated product still exists; resume or abort acceptance before releasing time.');
  let transaction;
  try {
    transaction = await eventProductWorkflow(container).getRunningTransaction(
      eventProductExecution(attemptId),
    );
  } catch (error) {
    if ((error as { type?: string }).type !== MedusaError.Types.NOT_FOUND) throw error;
  }
  if (!transaction) return;
  if (!transaction.hasFinished())
    throw new Error('Native product execution has an unresolved outcome; keep protected time.');
  const response = transaction.getContext().invoke['create-products'] as
    | { output?: { output?: Array<{ id: string }> } }
    | undefined;
  for (const product of response?.output?.output || []) {
    const existing = await service.retrieveProduct(product.id).catch((error) => {
      if (error.type !== MedusaError.Types.NOT_FOUND) throw error;
      return null;
    });
    if (existing) throw new Error('Native execution still owns a product; keep protected time.');
  }
}
