import { cachified } from '@epic-web/cachified';
import { sdkCache, baseMedusaConfig } from '../client.server';

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
  bypassCache = process.env.NODE_ENV !== 'production',
}: {
  limit?: number;
  offset?: number;
  q?: string;
  bypassCache?: boolean;
} = {}): Promise<StoreMenusResponse> => {
  const params = new URLSearchParams();
  params.append('limit', limit.toString());
  params.append('offset', offset.toString());
  if (q) params.append('q', q);
  if (bypassCache) params.append('_ts', Date.now().toString());

  const fetcher = async () => {
    
    // Add timeout to prevent hanging requests
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 15000); // 15 second timeout
    
    try {
      const response = await fetch(`${baseMedusaConfig.baseUrl}/store/menus?${params}`, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
          'x-publishable-api-key': baseMedusaConfig.publishableKey || '',
          ...(bypassCache ? { 'Cache-Control': 'no-cache' } : {}),
        },
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        throw new Error(`Failed to fetch menus: ${response.statusText}`);
      }

      return response.json();
    } catch (error) {
      clearTimeout(timeoutId);
      if (error instanceof Error && error.name === 'AbortError') {
        throw new Error('Request timeout - backend may be unavailable');
      }
      throw error;
    }
  }

  const cacheKey = `menus-${JSON.stringify({ limit, offset, q })}`;
  return cachified({
    key: cacheKey,
    cache: sdkCache,
    ttl: 1000 * 60 * 30,
    getFreshValue: fetcher,
  });
};

// Fetch a specific menu by ID with full details
export const fetchMenuById = async (id: string, bypassCache = process.env.NODE_ENV !== 'production'): Promise<StoreMenuResponse> => {
  const fetcher = async () => {
    const response = await fetch(`${baseMedusaConfig.baseUrl}/store/menus/${id}${bypassCache ? `?_ts=${Date.now()}` : ''}`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        'x-publishable-api-key': baseMedusaConfig.publishableKey || '',
        ...(bypassCache ? { 'Cache-Control': 'no-cache' } : {}),
      },
    });

    if (!response.ok) {
      if (response.status === 404) {
        throw new Error(`Menu not found: ${id}`);
      }
      throw new Error(`Failed to fetch menu: ${response.statusText}`);
    }

    return response.json();
  }

  if (bypassCache) {
    return fetcher();
  }

  const cacheKey = `menu-${id}`;
  return cachified({
    key: cacheKey,
    cache: sdkCache,
    ttl: 1000 * 60 * 30,
    getFreshValue: fetcher,
  });
};

// Get featured menus (first 6 menus for homepage)
export const getFeaturedMenus = async (): Promise<StoreMenuDTO[]> => {
  const response = await fetchMenus({ limit: 6, offset: 0 });
  return response.menus;
}; 