import { model } from '@medusajs/framework/utils';
export const AvailabilitySetting = model.define('availability_setting', {
  id: model.id().primaryKey(),
  timezone: model.text(),
  weekly: model.json(),
  overrides: model.json(),
  google_mode: model.enum(['required', 'internal_only']).default('required'),
});
