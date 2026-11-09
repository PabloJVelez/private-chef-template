import type { MedusaContainer } from '@medusajs/framework/types';
import { CHEF_EVENT_MODULE } from '../modules/chef-event';
import type ChefEventModuleService from '../modules/chef-event/service';
import { SCHEDULING_MODULE } from '../modules/scheduling';
import type SchedulingModuleService from '../modules/scheduling/service';
import { MedusaError } from '@medusajs/framework/utils';

/** Admin cancellation/deletion has committed before this command. Retry after interruption is safe. */
export async function releaseEventReservations(container: MedusaContainer, eventId: string) {
  const chef = container.resolve<ChefEventModuleService>(CHEF_EVENT_MODULE);
  const event = await chef.retrieveChefEvent(eventId).catch((error) => {
    if (error.type !== MedusaError.Types.NOT_FOUND) throw error;
    return null;
  });
  if (event && (event.status !== 'cancelled' || event.acceptanceToken))
    throw new MedusaError(
      MedusaError.Types.NOT_ALLOWED,
      'Only a cancelled or deleted event can release its reservations.',
    );
  const scheduling = container.resolve<SchedulingModuleService>(SCHEDULING_MODULE);
  const [reservations, count] = await scheduling.listAndCountReservations(
    {
      owner_id: eventId,
      state: ['held', 'confirmed'],
      ...(event ? { id: event.acceptanceExecution || `legacy-${eventId}` } : {}),
    },
    { take: 100 },
  );
  if (count > reservations.length) throw new Error('Incomplete reservation cleanup read.');
  for (const reservation of reservations)
    await scheduling.release({ id: reservation.id, ownerId: eventId, attemptId: reservation.attempt_id });
}
