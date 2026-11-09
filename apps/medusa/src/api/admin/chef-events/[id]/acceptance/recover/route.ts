import { z } from 'zod';
import { abortEventAcceptance } from '../../../../../../lib/abort-event-acceptance';
import type { AuthenticatedMedusaRequest, MedusaResponse } from '@medusajs/framework/http';
import { MedusaError } from '@medusajs/framework/utils';
import { CHEF_EVENT_MODULE } from '../../../../../../modules/chef-event';
import type ChefEventModuleService from '../../../../../../modules/chef-event/service';
import { runEventAcceptance } from '../../../../../../lib/run-event-acceptance';
import { releaseEventReservations } from '../../../../../../lib/release-event-reservations';

/** Bounded authenticated recovery: event-derived authority only, never arbitrary workflow/step IDs. */
export async function POST(req: AuthenticatedMedusaRequest, res: MedusaResponse) {
  if (!req.auth_context?.actor_id)
    throw new MedusaError(MedusaError.Types.UNAUTHORIZED, 'Admin authentication required.');
  const input = z
    .object({
      action: z.enum(['resume', 'abort']).default('resume'),
      requestId: z.string().uuid().optional(),
    })
    .strict()
    .parse(req.body || {});
  const chef = req.scope.resolve<ChefEventModuleService>(CHEF_EVENT_MODULE);
  const event = await chef.retrieveChefEvent(req.params.id).catch((error) => {
    if (error.type !== MedusaError.Types.NOT_FOUND) throw error;
    return null;
  });
  if (!event || event.status === 'cancelled') {
    await releaseEventReservations(req.scope, req.params.id);
    res.json({ success: true, released: true });
    return;
  }
  if (!event.acceptanceExecution)
    throw new MedusaError(
      MedusaError.Types.NOT_ALLOWED,
      'Legacy claim requires the documented maintenance audit.',
    );
  const attempt = await chef.retrieveAcceptanceAttempt(event.acceptanceExecution);
  if (attempt.actor_id !== req.auth_context.actor_id)
    throw new MedusaError(
      MedusaError.Types.NOT_ALLOWED,
      'Resume using the Admin actor that authorized this attempt.',
    );
  if (input.action === 'abort') {
    await abortEventAcceptance(req.scope, event.id, attempt.id);
    res.json({ success: true, resolved: true });
    return;
  }
  const executionId = input.requestId ? `recover-${attempt.id}-${input.requestId}` : attempt.id;
  const output = await runEventAcceptance(
    req.scope,
    { ...attempt.input, chefEventId: event.id, attemptId: attempt.id },
    executionId,
  );
  res
    .status(output.transaction.hasFinished() ? 200 : 202)
    .json({ executionId, state: output.transaction.getState(), data: output.result });
}
