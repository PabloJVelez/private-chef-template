import { model } from "@medusajs/framework/utils"
import { Course } from "./course"
import { MenuImage } from "./menu-image"
import { MenuExperiencePrice } from "./menu-experience-price"
import { DEFAULT_MENU_STATUS } from "../constants"

export const Menu = model.define("menu", {
  name: model.text(),
  id: model.id().primaryKey(),
  status: model.text().default(DEFAULT_MENU_STATUS),
  courses: model.hasMany(() => Course),
  images: model.hasMany(() => MenuImage),
  menu_experience_prices: model.hasMany(() => MenuExperiencePrice),
  thumbnail: model.text().nullable(),
  /** When true, chefs may save pricing with no positive per-person rows; guests see TBD copy instead of a quote. */
  allow_tbd_pricing: model.boolean().default(false),
}).cascades({
  delete: ["courses", "images", "menu_experience_prices"]
})