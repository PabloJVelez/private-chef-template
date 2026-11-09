import { model } from '@medusajs/framework/utils';

/** Event-owned binding of an authenticated request to one native workflow execution. */
export const AcceptanceAttempt = model.define('chef_event_acceptance_attempt', {
  id: model.id().primaryKey(),
  event_id: model.text(),
  actor_id: model.text(),
  request_key: model.text(),
  input: model.json(),
  state: model.enum(['active', 'finalized', 'aborted']).default('active'),
});
