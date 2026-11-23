import { Module } from "@medusajs/framework/utils";
import MealPrepModuleService from "./service";
export const MEAL_PREP_MODULE = "mealPrep";
export default Module(MEAL_PREP_MODULE, { service: MealPrepModuleService });
