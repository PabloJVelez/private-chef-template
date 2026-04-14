import { MedusaService } from "@medusajs/framework/utils"
import { Menu } from "./models/menu"
import { Course } from "./models/course"
import { Dish } from "./models/dish"
import { Ingredient } from "./models/ingredient"
import { MenuImage } from "./models/menu-image"
import { MenuExperiencePrice } from "./models/menu-experience-price"

class MenuModuleService extends MedusaService({
  Menu,
  Course,
  Dish,
  Ingredient,
  MenuImage,
  MenuExperiencePrice,
}){
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