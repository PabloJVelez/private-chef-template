import type { Client } from '@medusajs/js-sdk'

export interface StoreIngredientDTO {
  id: string
  name: string
  optional?: boolean
}

export interface StoreDishDTO {
  id: string
  name: string
  description?: string
  ingredients: StoreIngredientDTO[]
}

export interface StoreCourseDTO {
  id: string
  name: string
  dishes: StoreDishDTO[]
}

export interface StoreMenuExperiencePriceDTO {
  id: string
  menu_id: string
  experience_type_id: string
  price_per_person: number
  created_at: string
  updated_at: string
}

export interface StoreMenuDTO {
  id: string
  name: string
  status: string
  courses: StoreCourseDTO[]
  images: { id: string; url: string; rank: number }[]
  menu_experience_prices?: StoreMenuExperiencePriceDTO[]
  thumbnail?: string | null
  created_at: string
  updated_at: string
}

export interface StoreListMenusQuery {
  limit?: number
  offset?: number
  q?: string
}

export interface StoreMenusResponse {
  menus: StoreMenuDTO[]
  count: number
  offset: number
  limit: number
}

export interface StoreMenuResponse {
  menu: StoreMenuDTO
}

export class StoreMenusResource {
  constructor(private client: Client) {}

  /**
   * List available menus for customers
   * @param query - Query parameters
   * @returns List of menus
   */
  async list(query: StoreListMenusQuery = {}) {
    return this.client.fetch<StoreMenusResponse>(`/store/menus`, {
      method: 'GET',
      query,
    })
  }

  /**
   * Retrieve a menu with full details
   * @param id - Menu ID
   * @returns Menu details with courses, dishes, and ingredients
   */
  async retrieve(id: string) {
    return this.client.fetch<StoreMenuResponse>(`/store/menus/${id}`, {
      method: 'GET',
    })
  }
} 