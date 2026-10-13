import { model } from '@medusajs/framework/utils';

export const SocialImportJob = model.define('social_import_job', {
  id: model.id().primaryKey(),

  provider: model.enum(['instagram']).default('instagram'),
  account_id: model.text().nullable(),
  source_url: model.text(),
  handle: model.text().nullable(),
  status: model.enum(['queued', 'running', 'completed', 'failed', 'needs_connection']).default('queued'),

  provider_run_id: model.text().nullable(),
  provider_dataset_id: model.text().nullable(),
  provider_starting: model.boolean().default(false),
  attempt_count: model.number().default(0),
  skipped_count: model.number().default(0),
  lease_token: model.text().nullable(),
  lease_expires_at: model.dateTime().nullable(),
  next_attempt_at: model.dateTime().nullable(),
  failure_code: model.text().nullable(),
  imported_count: model.number().default(0),
  message: model.text().nullable(),
  error_message: model.text().nullable(),
  raw_result: model.json().nullable(),
  completed_at: model.dateTime().nullable(),
});

export default SocialImportJob;
