import type { Client } from '@medusajs/js-sdk'

export interface AdminIngredientDTO {
  id: string
  name: string
  optional?: boolean
  created_at: string
  updated_at: string
}

export interface AdminDishDTO {
  id: string
  name: string
  description?: string
  ingredients: AdminIngredientDTO[]
  created_at: string
  updated_at: string
}

export interface AdminCourseDTO {
  id: string
  name: string
  dishes: AdminDishDTO[]
  created_at: string
  updated_at: string
}

export interface AdminMenuImageDTO {
  id: string
  url: string
  rank: number
  created_at: string
  updated_at: string
}

export interface AdminMenuDTO {
  id: string
  name: string
  courses: AdminCourseDTO[]
  images: AdminMenuImageDTO[]
  thumbnail?: string | null
  created_at: string
  updated_at: string
}

export interface AdminCreateMenuDTO {
  name: string
  courses?: Array<{
    name: string
    dishes: Array<{
      name: string
      description?: string
      ingredients: Array<{
        name: string
        optional?: boolean
      }>
    }>
  }>
  images?: string[]
  thumbnail?: string | null
  image_files?: { url: string; file_id?: string }[]
}

export interface AdminUpdateMenuDTO {
  name?: string
  courses?: Array<{
    id?: string
    name: string
    dishes: Array<{
      id?: string
      name: string
      description?: string
      ingredients: Array<{
        id?: string
        name: string
        optional?: boolean
      }>
    }>
  }>
  images?: string[]
  thumbnail?: string | null
  image_files?: { url: string; file_id?: string }[]
}

export interface AdminListMenusQuery {
  limit?: number
  offset?: number
  q?: string
}

export interface AdminMenusResponse {
  menus: AdminMenuDTO[]
  count: number
  offset: number
  limit: number
}

export class AdminMenusResource {
  constructor(private client: Client) {}

  /**
   * List menus
   * @param query - Query parameters
   * @returns List of menus
   */
  async list(query: AdminListMenusQuery = {}) {
    return this.client.fetch<AdminMenusResponse>(`/admin/menus`, {
      method: 'GET',
      query,
    })
  }

  /**
   * Retrieve a menu
   * @param id - Menu ID
   * @returns Menu details
   */
  async retrieve(id: string) {
    return this.client.fetch<AdminMenuDTO>(`/admin/menus/${id}`, {
      method: 'GET',
    })
  }

  /**
   * Create a menu
   * @param data - Menu data
   * @returns Created menu
   */
  async create(data: AdminCreateMenuDTO) {
    return this.client.fetch<AdminMenuDTO>(`/admin/menus`, {
      method: 'POST',
      body: data,
    })
  }

  /**
   * Update a menu
   * @param id - Menu ID
   * @param data - Menu data
   * @returns Updated menu
   */
  async update(id: string, data: AdminUpdateMenuDTO) {
    return this.client.fetch<AdminMenuDTO>(`/admin/menus/${id}`, {
      method: 'POST',
      body: data,
    })
  }

  /**
   * Delete a menu
   * @param id - Menu ID
   * @returns Deleted menu
   */
  async delete(id: string) {
    return this.client.fetch<void>(`/admin/menus/${id}`, {
      method: 'DELETE',
    })
  }
} 