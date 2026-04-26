import { z } from "zod"
import {
  DEFAULT_MENU_STATUS,
  MENU_STATUS_VALUES,
} from "../../../modules/menu/constants"

export const menuStatusSchema = z.enum(MENU_STATUS_VALUES)

export const ingredientSchema = z.object({
  name: z.string().min(1, "Ingredient name is required"),
  optional: z.boolean().optional()
})

export const dishSchema = z.object({
  name: z.string().min(1, "Dish name is required"),
  description: z.string().optional(),
  ingredients: z.array(ingredientSchema)
})

export const courseSchema = z.object({
  name: z.string().min(1, "Course name is required"),
  dishes: z.array(dishSchema)
})

export const menuSchema = z.object({
  name: z.string().min(1, "Menu name is required"),
  status: menuStatusSchema.optional().default(DEFAULT_MENU_STATUS),
  courses: z.array(courseSchema).optional().default([])
}) 