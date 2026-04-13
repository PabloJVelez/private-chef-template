import MenuModuleService from "./service"
import { Module } from "@medusajs/framework/utils"
import { Menu } from "./models/menu"
import { Course } from "./models/course"
import { Dish } from "./models/dish"
import { Ingredient } from "./models/ingredient"
import { MenuExperiencePrice } from "./models/menu-experience-price"

export const MENU_MODULE = "menuModuleService"

export default Module(MENU_MODULE, {
  service: MenuModuleService,
})