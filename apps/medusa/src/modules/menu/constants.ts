export const MENU_STATUS_VALUES = ["draft", "active", "inactive"] as const

export type MenuStatus = (typeof MENU_STATUS_VALUES)[number]

export const DEFAULT_MENU_STATUS: MenuStatus = "draft"

export const STOREFRONT_VISIBLE_MENU_STATUSES: MenuStatus[] = ["active"]
