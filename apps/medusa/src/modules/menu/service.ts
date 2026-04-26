import { MedusaService } from "@medusajs/framework/utils"
import { Menu } from "./models/menu"
import { Course } from "./models/course"
import { Dish } from "./models/dish"
import { Ingredient } from "./models/ingredient"
import { MenuImage } from "./models/menu-image"
import { MenuExperiencePrice } from "./models/menu-experience-price"
import { DEFAULT_MENU_STATUS } from "./constants"

const MENU_FULL_RELATIONS = [
  "courses",
  "courses.dishes",
  "courses.dishes.ingredients",
  "images",
  "menu_experience_prices",
] as const

class MenuModuleService extends MedusaService({
  Menu,
  Course,
  Dish,
  Ingredient,
  MenuImage,
  MenuExperiencePrice,
}){
  /**
   * Duplicates an existing menu and its nested content (courses, dishes,
   * ingredients, images, prices) into a new draft menu. The duplicate always
   * starts in {@link DEFAULT_MENU_STATUS} so it is hidden from the storefront
   * until intentionally activated.
   */
  async duplicateMenu(menuId: string, name?: string) {
    const source = await this.retrieveMenu(menuId, {
      relations: [...MENU_FULL_RELATIONS],
    })

    const duplicatedName = name?.trim() || `${source.name} (Copy)`
    const duplicatedMenu = await this.createMenus({
      name: duplicatedName,
      status: DEFAULT_MENU_STATUS,
      allow_tbd_pricing: Boolean(source.allow_tbd_pricing),
      thumbnail: source.thumbnail ?? null,
    })

    for (const course of source.courses || []) {
      const duplicatedCourse = await this.createCourses({
        name: course.name,
        menu_id: duplicatedMenu.id,
      })

      for (const dish of course.dishes || []) {
        const duplicatedDish = await this.createDishes({
          name: dish.name,
          description: dish.description,
          course_id: duplicatedCourse.id,
        })

        if (dish.ingredients?.length) {
          await this.createIngredients(
            dish.ingredients.map((ingredient) => ({
              name: ingredient.name,
              optional: ingredient.optional ?? false,
              dish_id: duplicatedDish.id,
            }))
          )
        }
      }
    }

    if (source.images?.length) {
      await this.createMenuImages(
        source.images.map((image) => ({
          menu_id: duplicatedMenu.id,
          url: image.url,
          rank: image.rank,
          metadata: image.metadata as any,
        }))
      )
    }

    if (source.menu_experience_prices?.length) {
      await this.createMenuExperiencePrices(
        source.menu_experience_prices.map((price) => ({
          menu_id: duplicatedMenu.id,
          experience_type_id: price.experience_type_id,
          price_per_person: price.price_per_person,
        }))
      )
    }

    return this.retrieveMenu(duplicatedMenu.id, {
      relations: [...MENU_FULL_RELATIONS],
    })
  }

  async replaceMenuImages(
    menuId: string,
    urls: string[],
    opts?: { thumbnail?: string | null; fileMap?: Record<string, string | undefined> }
  ): Promise<void> {
    // Remove existing images
    const existing = await this.listMenuImages({ menu_id: menuId })
    for (const img of existing) {
      await this.deleteMenuImages(img.id)
    }

    // Create new images with rank
    for (let i = 0; i < urls.length; i++) {
      const url = urls[i]
      const metadata = opts?.fileMap && opts.fileMap[url] ? { file_id: opts.fileMap[url] } : undefined
      await this.createMenuImages({ menu_id: menuId, url, rank: i, metadata: metadata as any })
    }

    // Update thumbnail
    let nextThumb: string | null | undefined = opts?.thumbnail
    if (nextThumb === undefined) {
      nextThumb = urls.length > 0 ? urls[0] : null
    }
    await this.updateMenus({ id: menuId, thumbnail: nextThumb as any })
  }

  async deleteMenuImage(menuId: string, imageId: string): Promise<void> {
    const image = await this.retrieveMenuImage(imageId)
    if (!image || image.menu_id !== menuId) {
      throw new Error("Menu image not found or does not belong to menu")
    }
    await this.deleteMenuImages(imageId)
  }
}

export default MenuModuleService