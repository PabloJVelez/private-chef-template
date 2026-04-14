import type { Client } from '@medusajs/js-sdk';

export type LocationType = 'customer' | 'fixed';
export type PricingType = 'per_person' | 'per_item' | 'product_based';

export interface AdminExperienceTypeDTO {
  id: string;
  name: string;
  slug: string;
  description?: string;
  short_description?: string | null;
  icon?: string | null;
  image_url?: string | null;
  highlights?: string[] | null;
  ideal_for?: string | null;
  pricing_type: PricingType;
  price_per_unit?: number | null;
  duration_minutes?: number | null;
  duration_display?: string | null;
  is_product_based: boolean;
  location_type: LocationType;
  fixed_location_address?: string | null;
  requires_advance_notice: boolean;
  advance_notice_days: number;
  available_time_slots?: string[] | null;
  time_slot_start?: string | null;
  time_slot_end?: string | null;
  time_slot_interval_minutes: number;
  min_party_size: number;
  max_party_size?: number | null;
  is_active: boolean;
  is_featured: boolean;
  sort_order: number;
  created_at: string;
  updated_at: string;
}

export interface AdminCreateExperienceTypeDTO {
  name: string;
  slug?: string;
  description?: string;
  short_description?: string | null;
  icon?: string | null;
  image_url?: string | null;
  highlights?: string[];
  ideal_for?: string | null;
  pricing_type?: PricingType;
  price_per_unit?: number | null;
  duration_minutes?: number | null;
  duration_display?: string | null;
  is_product_based?: boolean;
  location_type?: LocationType;
  fixed_location_address?: string | null;
  requires_advance_notice?: boolean;
  advance_notice_days?: number;
  available_time_slots?: string[];
  time_slot_start?: string | null;
  time_slot_end?: string | null;
  time_slot_interval_minutes?: number;
  min_party_size?: number;
  max_party_size?: number | null;
  is_active?: boolean;
  is_featured?: boolean;
  sort_order?: number;
}

export type AdminUpdateExperienceTypeDTO = Partial<AdminCreateExperienceTypeDTO>;

export interface AdminExperienceTypesResponse {
  experience_types: AdminExperienceTypeDTO[];
}

export class AdminExperienceTypesResource {
  constructor(private client: Client) {}

  async list(query: Record<string, any> = {}) {
    return this.client.fetch<AdminExperienceTypesResponse>(`/admin/experience-types`, {
      method: 'GET',
      query,
    });
  }

  async retrieve(id: string) {
    const response = await this.client.fetch<{ experience_type: AdminExperienceTypeDTO }>(
      `/admin/experience-types/${id}`,
      { method: 'GET' },
    );
    return response.experience_type;
  }

  async create(data: AdminCreateExperienceTypeDTO) {
    const response = await this.client.fetch<{ experience_type: AdminExperienceTypeDTO }>(`/admin/experience-types`, {
      method: 'POST',
      body: data,
    });
    return response.experience_type;
  }

  async update(id: string, data: AdminUpdateExperienceTypeDTO) {
    const response = await this.client.fetch<{ experience_type: AdminExperienceTypeDTO }>(
      `/admin/experience-types/${id}`,
      {
        method: 'PUT',
        body: data,
      },
    );
    return response.experience_type;
  }

  async delete(id: string) {
    return this.client.fetch<{ id: string; deleted: boolean }>(`/admin/experience-types/${id}`, {
      method: 'DELETE',
    });
  }
}
