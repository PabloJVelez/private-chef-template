import ChefEventModuleService from "./service"
import { Module } from "@medusajs/framework/utils"

export const CHEF_EVENT_MODULE = "chefEventModuleService"

export default Module(CHEF_EVENT_MODULE, {
  service: ChefEventModuleService,
})