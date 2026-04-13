import type { Client } from '@medusajs/js-sdk'

export interface StoreChefEventDTO {
  id: string
  status: 'pending' | 'confirmed' | 'cancelled' | 'completed'
  requestedDate: string
  requestedTime: string
  partySize: number
  eventType: string
  experience_type_id?: string | null
  templateProductId?: string
  locationType: 'customer_location' | 'chef_location'
  locationAddress: string
  firstName: string
  lastName: string
  email: string
  phone?: string
  notes?: string
  totalPrice: number
  specialRequirements?: string
  createdAt: string
  updatedAt: string
}

export interface StoreCreateChefEventDTO {
  requestedDate: string
  requestedTime: string
  partySize: number
  eventType: string
  experience_type_id?: string | null
  templateProductId?: string
  locationType: 'customer_location' | 'chef_location'
  locationAddress: string
  firstName: string
  lastName: string
  email: string
  phone?: string
  notes?: string
  specialRequirements?: string
}

export interface StoreChefEventResponse {
  chefEvent: StoreChefEventDTO
  message: string
}

export class StoreChefEventsResource {
  constructor(private client: Client) {}

  /**
   * Create a chef event request
   * @param data - Chef event request data
   * @returns Created chef event with confirmation message
   */
  async create(data: StoreCreateChefEventDTO) {
    return this.client.fetch<StoreChefEventResponse>(`/store/chef-events`, {
      method: 'POST',
      body: data,
    })
  }
} 