import type { Client } from '@medusajs/js-sdk'
import { StoreMenusResource } from './store-menus'
import { StoreChefEventsResource } from './store-chef-events'

export class ExtendedStoreSDK {
  public menus: StoreMenusResource
  public chefEvents: StoreChefEventsResource

  constructor(client: Client) {
    this.menus = new StoreMenusResource(client)
    this.chefEvents = new StoreChefEventsResource(client)
  }
}

export { StoreMenusResource } from './store-menus'
export { StoreChefEventsResource } from './store-chef-events'
export type {
  StoreMenuDTO,
  StoreCourseDTO,
  StoreDishDTO,
  StoreIngredientDTO,
  StoreListMenusQuery,
  StoreMenusResponse,
  StoreMenuResponse
} from './store-menus'
export type {
  StoreChefEventDTO,
  StoreCreateChefEventDTO,
  StoreChefEventResponse,
  StoreInitializeChefEventCartDTO,
} from './store-chef-events' 