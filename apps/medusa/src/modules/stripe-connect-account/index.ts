import StripeConnectAccountModuleService from "./service";
import { Module } from "@medusajs/framework/utils";

export const STRIPE_CONNECT_ACCOUNT_MODULE =
  "stripeConnectAccountModuleService";

export default Module(STRIPE_CONNECT_ACCOUNT_MODULE, {
  service: StripeConnectAccountModuleService,
});

