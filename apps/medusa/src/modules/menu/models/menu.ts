import { model } from "@medusajs/framework/utils"
import { Course } from "./course"
import { MenuImage } from "./menu-image"
import { MenuExperiencePrice } from "./menu-experience-price"

export const Menu = model.define("menu", {
  name: model.text(),
  id: model.id().primaryKey(),
  courses: model.hasMany(() => Course),
  images: model.hasMany(() => MenuImage),
  menu_experience_prices: model.hasMany(() => MenuExperiencePrice),
  thumbnail: model.text().nullable(),
}).cascades({
  delete: ["courses", "images", "menu_experience_prices"]
})