import { baseMedusaConfig } from '../client.server';

export interface StoreExperienceTypeDTO {
  id: string;
  name: string;
  slug: string;
  description: string;
  short_description?: string | null;
  icon?: string | null;
  image_url?: string | null;
  highlights?: string[] | null;
  ideal_for?: string | null;
  pricing_type: 'per_person' | 'per_item' | 'product_based';
  price_per_unit?: number | null;
  duration_minutes?: number | null;
  duration_display?: string | null;
  is_product_based: boolean;
  workflow_event_type: 'cooking_class' | 'plated_dinner' | 'buffet_style';
  location_type: 'customer' | 'fixed';
  fixed_location_address?: string | null;
  requires_advance_notice: boolean;
  advance_notice_days: number;
  min_party_size: number;
  max_party_size?: number | null;
  is_active: boolean;
  is_featured: boolean;
  sort_order: number;
  created_at: string;
  updated_at: string;
}

export interface StoreExperienceTypesResponse {
  experience_types: StoreExperienceTypeDTO[];
}

export async function fetchExperienceTypes(): Promise<StoreExperienceTypesResponse> {
  try {
    const response = await fetch(`${baseMedusaConfig.baseUrl}/store/experience-types`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        'x-publishable-api-key': baseMedusaConfig.publishableKey || '',
      },
    });

    if (!response.ok) {
      console.error(`Failed to fetch experience types: ${response.status}`);
      return { experience_types: [] };
    }

    return await response.json();
  } catch (error) {
    console.error('Error fetching experience types:', error);
    return { experience_types: [] };
  }
}

export async function retrieveExperienceTypeBySlug(slug: string): Promise<StoreExperienceTypeDTO | null> {
  try {
    const response = await fetch(`${baseMedusaConfig.baseUrl}/store/experience-types/${slug}`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        'x-publishable-api-key': baseMedusaConfig.publishableKey || '',
      },
    });

    if (!response.ok) return null;

    const data: { experience_type: StoreExperienceTypeDTO } = await response.json();
    return data.experience_type;
  } catch (error) {
    console.error(`Error fetching experience type by slug "${slug}":`, error);
    return null;
  }
}
