import { model } from '@medusajs/framework/utils';

export const SocialImportJob = model.define('social_import_job', {
  id: model.id().primaryKey(),

  provider: model.enum(['instagram']).default('instagram'),
  account_id: model.text().nullable(),
  source_url: model.text(),
  handle: model.text().nullable(),
  status: model.enum(['queued', 'running', 'completed', 'failed', 'needs_connection']).default('queued'),

  imported_count: model.number().default(0),
  message: model.text().nullable(),
  error_message: model.text().nullable(),
  raw_result: model.json().nullable(),
  completed_at: model.dateTime().nullable(),
});

export default SocialImportJob;
