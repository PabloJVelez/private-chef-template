import type { IProductModuleService, MedusaContainer } from '@medusajs/framework/types';
import { MedusaError, Modules } from '@medusajs/framework/utils';
import { deleteProductsWorkflow } from '@medusajs/medusa/core-flows';
import { CHEF_EVENT_MODULE } from '../modules/chef-event';
import type ChefEventModuleService from '../modules/chef-event/service';
import { SCHEDULING_MODULE } from '../modules/scheduling';
import type SchedulingModuleService from '../modules/scheduling/service';
import { eventProductExecution, withEventProductLock } from './booking-execution';

/** Explicit Admin abort after an interrupted/failed attempt. No refunds or accepted-product deletion. */
export async function abortEventAcceptance(container: MedusaContainer, eventId: string, attemptId: string) {
  return withEventProductLock(container, attemptId, async () => {
    const chef = container.resolve<ChefEventModuleService>(CHEF_EVENT_MODULE);
    const event = await chef.retrieveChefEvent(eventId);
    if (event.status !== 'pending' || event.productId || event.acceptanceExecution !== attemptId)
      throw new MedusaError(
        MedusaError.Types.NOT_ALLOWED,
        'Only the current pending acceptance can be aborted.',
      );
    const productService = container.resolve<IProductModuleService>(Modules.PRODUCT);
    const [products, count] = await productService.listAndCountProducts(
      { external_id: eventProductExecution(attemptId) },
      { take: 2 },
    );
    if (
      count > 1 ||
      products.some(
        (product) =>
          product.status !== 'draft' ||
          product.metadata?.acceptance_attempt !== attemptId ||
          product.metadata?.chef_event_id !== eventId,
      )
    )
      throw new Error('Product ownership or state is ambiguous. Protected time must be retained.');
    const aborted =
      (await chef.releaseAcceptance(eventId, attemptId)) ||
      (await chef.abortUnclaimedAcceptance(eventId, attemptId));
    if (!aborted) throw new Error('Acceptance cannot be aborted after finalization.');
    if (products.length)
      await deleteProductsWorkflow(container).run({ input: { ids: products.map((product) => product.id) } });
    const scheduling = container.resolve<SchedulingModuleService>(SCHEDULING_MODULE);
    const reservations = await scheduling.listReservations({
      id: attemptId,
      owner_id: eventId,
      attempt_id: attemptId,
    });
    if (reservations.length) await scheduling.release({ id: attemptId, ownerId: eventId, attemptId });
  });
}
