import { baseMedusaConfig } from "../client.server";

export type StoreSocialGalleryMediaType = "image" | "video" | "carousel";
export type StoreSocialGalleryCategory =
  | "dishes"
  | "private_dinners"
  | "events"
  | "behind_the_scenes"
  | "press_collabs";
export type StoreSocialGalleryDisplayStyle =
  | "normal"
  | "large"
  | "wide"
  | "feature";

export interface StoreGalleryAsset {
  type: "image" | "video";
  url: string;
  poster_url?: string | null;
  width?: number | null;
  height?: number | null;
}

export interface StoreSocialGalleryPostDTO {
  media_assets?: StoreGalleryAsset[];
  id: string;
  title: string;
  caption?: string | null;
  source_url?: string | null;
  instagram_handle?: string | null;
  posted_at?: string | null;
  media_type: StoreSocialGalleryMediaType;
  media_url?: string | null;
  thumbnail_url?: string | null;
  poster_url?: string | null;
  alt_text?: string | null;
  category: StoreSocialGalleryCategory;
  display_style: StoreSocialGalleryDisplayStyle;
  linked_service_label?: string | null;
  cta_label?: string | null;
  cta_url?: string | null;
  is_active: boolean;
  is_featured: boolean;
  sort_order: number;
  created_at?: string;
  updated_at?: string;
}

export interface StoreSocialGalleryPostsResponse {
  count: number;
  categories?: StoreSocialGalleryCategory[];
  unavailable?: boolean;
  social_gallery_posts: StoreSocialGalleryPostDTO[];
}

export async function fetchSocialGalleryPosts(
  page = 1,
  category = "all",
): Promise<StoreSocialGalleryPostsResponse> {
  try {
    const response = await fetch(
      `${baseMedusaConfig.baseUrl}/store/social-gallery-posts?limit=24&offset=${(page - 1) * 24}${category === "all" ? "" : `&category=${encodeURIComponent(category)}`}`,
      {
        signal: AbortSignal.timeout(10000),
        method: "GET",
        headers: {
          "Content-Type": "application/json",
          "x-publishable-api-key": baseMedusaConfig.publishableKey || "",
        },
      },
    );

    if (!response.ok) {
      console.error(`Failed to fetch social gallery posts: ${response.status}`);
      return { social_gallery_posts: [], count: 0, unavailable: true };
    }

    return await response.json();
  } catch (error) {
    console.error("Error fetching social gallery posts:", error);
    return { social_gallery_posts: [], count: 0, unavailable: true };
  }
}
