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
      if (executionId !== input.attemptId) {
        const original = await workflow.getRunningTransaction(input.attemptId);
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
