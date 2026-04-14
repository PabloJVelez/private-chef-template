import { model } from "@medusajs/framework/utils"
import { Menu } from "./menu"

export const MenuExperiencePrice = model.define("menu_experience_price", {
  id: model.id().primaryKey(),
  menu: model.belongsTo(() => Menu, { mappedBy: "menu_experience_prices" }),
  experience_type_id: model.text(),
  price_per_person: model.bigNumber(),
}).indexes([
  {
    on: ["menu_id", "experience_type_id"],
    unique: true,
  }
])
