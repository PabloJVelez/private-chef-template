import {
  INVALID_TICKET_DETAILS,
  RESOLVED_INVALID_TICKET_DETAILS,
  UNRESOLVED_INVALID_TICKET_DETAILS,
} from '../../../../../lib/acceptance-messages';
import type { AuthenticatedMedusaRequest, MedusaResponse } from '@medusajs/framework/http';
import { MedusaError } from '@medusajs/framework/utils';
import { z } from 'zod';
import { runEventAcceptance } from '../../../../../lib/run-event-acceptance';
import { CHEF_EVENT_MODULE } from '../../../../../modules/chef-event';
import type ChefEventModuleService from '../../../../../modules/chef-event/service';

const schema = z.object({
  attemptId: z.string().uuid().optional(),
  chefNotes: z.string().optional(),
  acceptedBy: z.string().optional(),
  sendAcceptanceEmail: z.boolean().default(true),
});

export async function POST(req: AuthenticatedMedusaRequest, res: MedusaResponse) {
  const actorId = req.auth_context?.actor_id;
  if (!actorId) throw new MedusaError(MedusaError.Types.UNAUTHORIZED, 'Admin authentication is required.');
  const { attemptId, ...body } = schema.parse(req.body);
  const chef = req.scope.resolve<ChefEventModuleService>(CHEF_EVENT_MODULE);
  const attempt = await chef.bindAcceptance({
    eventId: req.params.id,
    actorId,
    requestKey: attemptId,
    body: { ...body, acceptedBy: body.acceptedBy || 'chef' },
  });
  if (attempt.state === 'aborted') {
    res.status(409).json({
      success: false,
      attemptId: attempt.request_key,
      resolved: !!attempt.cleanup_completed_at,
      message: attempt.cleanup_completed_at
        ? 'This acceptance attempt failed. Submit a new attemptId to try again.'
        : 'Acceptance requires recovery. Protected time is retained until cleanup is verified.',
    });
    return;
  }
  const execution = await runEventAcceptance(req.scope, {
    ...attempt.input,
    chefEventId: req.params.id,
    attemptId: attempt.id,
  });
  const finished = execution.transaction.hasFinished();
  const failed = ['failed', 'reverted'].includes(execution.transaction.getState());
  const invalidTicket = execution.errors?.some(({ error }) => error?.message === INVALID_TICKET_DETAILS);
  let resolved = false;
  if (failed) {
    await chef.abortUnclaimedAcceptance(req.params.id, attempt.id);
    resolved = !!(await chef.retrieveAcceptanceAttempt(attempt.id)).cleanup_completed_at;
  }
  res.status(failed || invalidTicket ? 409 : finished ? 200 : 202).json({
    success: !failed && !invalidTicket,
    attemptId: attempt.request_key,
    executionId: attempt.id,
    pending: !finished,
    resolved,
    data: execution.result,
    ...(failed || invalidTicket
      ? {
          message: resolved
            ? invalidTicket
              ? RESOLVED_INVALID_TICKET_DETAILS
              : 'This acceptance attempt failed. Submit a new attemptId to try again.'
            : invalidTicket
              ? UNRESOLVED_INVALID_TICKET_DETAILS
              : 'Acceptance requires recovery. Protected time is retained until cleanup is verified.',
        }
      : {}),
  });
}
