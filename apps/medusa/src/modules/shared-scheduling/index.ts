import { Module } from "@medusajs/framework/utils";
import SharedSchedulingService from "./service";

export const SHARED_SCHEDULING_MODULE = "sharedScheduling";
// This installation has one chef resource, shared with existing Availability.
// Actor/customer/payment-account identifiers must never select another resource.
export const CHEF_RESOURCE_ID = "chef-default";
export default Module(SHARED_SCHEDULING_MODULE, {
  service: SharedSchedulingService,
});
