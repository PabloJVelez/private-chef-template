import { eventProductWorkflow, eventProductExecution } from './booking-execution';
import { BOOKING_EXECUTION_RETENTION_SECONDS, BOOKING_HISTORY_UNAVAILABLE } from './booking-retention';
import { CHEF_EVENT_MODULE } from '../modules/chef-event';
import type ChefEventModuleService from '../modules/chef-event/service';
import type { ILockingModule, MedusaContainer } from '@medusajs/framework/types';
import { MedusaError, Modules } from '@medusajs/framework/utils';
import { acceptChefEventWorkflow, type AcceptChefEventWorkflowInput } from '../workflows/accept-chef-event';

/** Native initial checkpoint upserts in 2.7 can race. Serialize entry for this attempt only. */
export function runEventAcceptance(
  container: MedusaContainer,
  input: AcceptChefEventWorkflowInput,
  executionId = input.attemptId,
) {
  return container.resolve<ILockingModule>(Modules.LOCKING).execute(
    `private-event-acceptance-${input.attemptId}`,
    async () => {
      const workflow = acceptChefEventWorkflow(container);
      const original = await workflow.getRunningTransaction(input.attemptId).catch((error) => {
        if (error.type !== MedusaError.Types.NOT_FOUND) throw error;
        return undefined;
      });
      if (!original) {
        const chef = container.resolve<ChefEventModuleService>(CHEF_EVENT_MODULE);
        const attempt = await chef.retrieveAcceptanceAttempt(input.attemptId);
        const event = await chef.retrieveChefEvent(input.chefEventId);
        const child = event.acceptanceToken === input.attemptId
          ? await eventProductWorkflow(container).getRunningTransaction(eventProductExecution(input.attemptId))
              .catch((error) => { if (error.type !== MedusaError.Types.NOT_FOUND) throw error; return undefined; })
          : undefined;
        // A retained child can precede the first parent run (legacy interrupted acceptance).
        // Missing history is never evidence that a previous execution failed. In particular,
        // do not replay finalized commands (email/calendar dispatch can already have happened).
        if (
          attempt.state !== 'active' || (event.acceptanceToken && !child) || event.productId ||
          Date.now() - new Date(attempt.created_at).getTime() >= BOOKING_EXECUTION_RETENTION_SECONDS * 1000
        ) throw new MedusaError(MedusaError.Types.NOT_ALLOWED, BOOKING_HISTORY_UNAVAILABLE);
      }
      if (executionId !== input.attemptId) {
        if (!original || !original.hasFinished() || !['failed', 'reverted'].includes(original.getState()))
          throw new MedusaError(
            MedusaError.Types.NOT_ALLOWED,
            'A new recovery execution requires a terminally failed acceptance. Resume the original execution.',
          );
      }
      return workflow.run({ input, context: { transactionId: executionId }, throwOnError: false });
    },
    { timeout: 10 },
  );
}
