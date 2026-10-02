import { model } from '@medusajs/framework/utils';

export const SocialAccount = model.define('social_account', {
  id: model.id().primaryKey(),

  provider: model.enum(['instagram']).default('instagram'),
  handle: model.text(),
  profile_url: model.text(),
  status: model.enum(['needs_connection', 'connected', 'import_limited', 'active', 'error']).default('needs_connection'),

  last_synced_at: model.dateTime().nullable(),
  last_error: model.text().nullable(),
  metadata: model.json().nullable(),
});

export default SocialAccount;
