import { model } from '@medusajs/framework/utils';

export const StripeAccount = model.define('stripe_connect_account', {
  id: model.id().primaryKey(),
  stripe_account_id: model.text(),
  details_submitted: model.boolean().default(false),
  charges_enabled: model.boolean().default(false),
});

export default StripeAccount;

