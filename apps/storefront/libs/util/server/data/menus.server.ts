import { baseMedusaConfig } from '../client.server';

export interface StoreIngredientDTO {
  id: string;
  name: string;
  optional?: boolean;
}

export interface StoreDishDTO {
  id: string;
  name: string;
  description?: string;
  ingredients: StoreIngredientDTO[];
}

export interface StoreCourseDTO {
  id: string;
  name: string;
  dishes: StoreDishDTO[];
}

export interface StoreMenuDTO {
  id: string;
  name: string;
  courses: StoreCourseDTO[];
  images?: { id: string; url: string; rank: number }[];
  thumbnail?: string | null;
  created_at: string;
  updated_at: string;
}

export interface StoreMenusResponse {
  menus: StoreMenuDTO[];
  count: number;
  offset: number;
  limit: number;
}

export interface StoreMenuResponse {
  menu: StoreMenuDTO;
}

// Fetch all available menus with optional search and pagination
export const fetchMenus = async ({
  limit = 20,
  offset = 0,
  q,
}: {
  limit?: number;
  offset?: number;
  q?: string;
} = {}): Promise<StoreMenusResponse> => {
  const params = new URLSearchParams();
  params.append('limit', limit.toString());
  params.append('offset', offset.toString());
  if (q) params.append('q', q);

  const response = await fetch(`${baseMedusaConfig.baseUrl}/store/menus?${params}`, {
    method: 'GET',
    headers: {
      'Content-Type': 'application/json',
      'x-publishable-api-key': baseMedusaConfig.publishableKey || '',
    },
  });

  if (!response.ok) {
    throw new Error(`Failed to fetch menus: ${response.statusText}`);
  }

  return response.json();
};

// Fetch a specific menu by ID with full details
export const fetchMenuById = async (id: string): Promise<StoreMenuResponse> => {
  const response = await fetch(`${baseMedusaConfig.baseUrl}/store/menus/${id}`, {
    method: 'GET',
    headers: {
      'Content-Type': 'application/json',
      'x-publishable-api-key': baseMedusaConfig.publishableKey || '',
    },
  });

  if (!response.ok) {
    if (response.status === 404) {
      throw new Error(`Menu not found: ${id}`);
    }
    throw new Error(`Failed to fetch menu: ${response.statusText}`);
  }

  return response.json();
};

// Get featured menus (first 6 menus for homepage)
export const getFeaturedMenus = async (): Promise<StoreMenuDTO[]> => {
  const response = await fetchMenus({ limit: 6, offset: 0 });
  return response.menus;
}; 