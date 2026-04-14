// apps/medusa/src/sdk/index.ts
import { Client, Admin } from '@medusajs/js-sdk'
import { AdminMenusResource } from './admin/admin-menus'
import { AdminChefEventsResource } from './admin/admin-chef-events'
import { AdminUploadsResource } from './admin/admin-uploads'
import { AdminStripeConnectResource } from './admin/admin-stripe-connect'
import { AdminExperienceTypesResource } from './admin/admin-experience-types'
import { ExtendedStoreSDK } from './store'

// Vite will inline this at build time for browser bundles.
// In Node it will be undefined, which is fine.
declare const __VITE_MEDUSA_BACKEND_URL__: string | undefined

class ExtendedAdminSDK extends Admin {
  public menus: AdminMenusResource
  public chefEvents: AdminChefEventsResource
  public uploads: AdminUploadsResource
  public stripeConnect: AdminStripeConnectResource
  public experienceTypes: AdminExperienceTypesResource

  constructor(client: Client) {
    super(client)
    this.menus = new AdminMenusResource(client)
    this.chefEvents = new AdminChefEventsResource(client)
    this.uploads = new AdminUploadsResource(client)
    this.stripeConnect = new AdminStripeConnectResource(client)
    this.experienceTypes = new AdminExperienceTypesResource(client)
  }
}

export class ExtendedSDK {
  public admin: ExtendedAdminSDK
  public store: ExtendedStoreSDK

  constructor(baseUrl: string) {
    if (!baseUrl) throw new Error('ExtendedSDK baseUrl is required')
    const normalized = baseUrl.replace(/\/+$/, '')

    this.admin = new ExtendedAdminSDK(
      new Client({ baseUrl: normalized, auth: { type: 'session' } })
    )
    this.store = new ExtendedStoreSDK(new Client({ baseUrl: normalized }))
  }
}

// Resolve base URL safely for both browser (Vite) and Node (SSR)
const baseUrl =
  (typeof __VITE_MEDUSA_BACKEND_URL__ !== 'undefined' && __VITE_MEDUSA_BACKEND_URL__) ||
  (typeof window !== 'undefined' ? window.location.origin : undefined) ||
  process.env.MEDUSA_BACKEND_URL ||
  process.env.ADMIN_BACKEND_URL ||
  'http://localhost:9000'

export const sdk = new ExtendedSDK(baseUrl)

export { AdminChefEventsResource } from './admin/admin-chef-events'
export { AdminMenusResource } from './admin/admin-menus'
export { AdminStripeConnectResource } from './admin/admin-stripe-connect'
export { ExtendedStoreSDK } from './store'
export type * from './store'
export type {
  StripeConnectStatus,
  StripeConnectStatusResponse,
  StripeConnectAccountLinkBody,
  StripeConnectAccountLinkResponse,
} from './admin/admin-stripe-connect'
