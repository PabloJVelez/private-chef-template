import type { AuthenticatedMedusaRequest, MedusaResponse } from '@medusajs/framework/http';
import type { ConfigModule } from '@medusajs/framework/types';
import { MedusaError } from '@medusajs/framework/utils';
import { authorizedSiteAdmin } from '../chef-ai/access';
import { authorizeScheduleEdit, previewScheduleEdit, recoverScheduleEdit } from './command';
import { previewInput, referenceInput, verifyReference } from './contract';
import { editPendingEventScheduleWorkflow } from '../../workflows/edit-pending-event-schedule';

const status = (result: Awaited<ReturnType<typeof recoverScheduleEdit>>) =>
  result.outcome === 'unknown' ? 202 : result.outcome.outcome === 'rejected' ? 409 : 200;

export const scheduleEditHandler =
  (action: 'preview' | 'confirm' | 'recover') =>
  async (req: AuthenticatedMedusaRequest, res: MedusaResponse) => {
    res.setHeader('Cache-Control', 'no-store');
    if (!authorizedSiteAdmin(req.auth_context))
      return res.status(403).json({ message: 'Schedule edit access denied.' });
    const actor = req.auth_context.actor_id;
    try {
      await authorizeScheduleEdit(req.scope, actor);
    } catch {
      return res.status(403).json({
        message: 'Schedule edit access could not be verified or writes are disabled.',
      });
    }
    const body = (action === 'preview' ? previewInput : referenceInput).safeParse(req.body);
    if (!body.success)
      return res.status(400).json({
        message: 'Invalid schedule edit input. Use only the documented fields.',
      });
    const secret = req.scope.resolve<ConfigModule>('configModule').projectConfig.http?.jwtSecret;
    if (typeof secret !== 'string' || secret.length < 32)
      return res.status(503).json({
        message: 'Configure a strong Admin JWT signing secret before enabling schedule edits.',
      });
    if (action === 'preview') {
      try {
        return res.json(await previewScheduleEdit(req.scope, actor, body.data, secret));
      } catch (error) {
        return res
          .status(error instanceof MedusaError && error.type === MedusaError.Types.NOT_FOUND ? 404 : 422)
          .json({
            message:
              error instanceof MedusaError
                ? error.message
                : 'Preview unavailable. Check experience and availability configuration.',
          });
      }
    }
    let input;
    try {
      input = verifyReference((body.data as { reference: string }).reference, actor, secret);
    } catch {
      return res.status(403).json({
        message: 'Invalid reference or different Admin user. Use the original preview reference.',
      });
    }
    try {
      // Authenticate and validate immutable input before consulting workflow history. Recovery never reapplies an event edit.
      const recovered = await recoverScheduleEdit(req.scope, input);
      if (action === 'recover' || recovered.outcome !== 'unknown') {
        return res.status(status(recovered)).json(recovered);
      }
      const { result } = await editPendingEventScheduleWorkflow(req.scope).run({
        input,
        context: { transactionId: input.operationId },
      });
      if (!result)
        return res.status(202).json({
          outcome: 'unknown',
          operationId: input.operationId,
          message: 'Recover this operation before creating another edit.',
        });
      return res.status(status(result)).json(result);
    } catch {
      // A failed HTTP response/checkpoint is not proof of rollback; do not expose provider/customer data.
      return res.status(202).json({
        outcome: 'unknown',
        operationId: input.operationId,
        message:
          'The outcome could not be verified. Recover using this same reference before creating another edit.',
      });
    }
  };
