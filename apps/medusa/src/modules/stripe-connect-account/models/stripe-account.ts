import { model } from "@medusajs/framework/utils";

export const StripeAccount = model.define("stripe_connect_account", {
  id: model.id().primaryKey(),
  stripe_account_id: model.text(),
  account_type: model.enum(["express", "standard"]).default("express"),
  connection_method: model
    .enum(["platform_onboarding", "oauth"])
    .default("platform_onboarding"),
  details_submitted: model.boolean().default(false),
  charges_enabled: model.boolean().default(false),
  payouts_enabled: model.boolean().default(false),
  connected_at: model.dateTime().nullable(),
  disconnected_at: model.dateTime().nullable(),
});

export default StripeAccount;
