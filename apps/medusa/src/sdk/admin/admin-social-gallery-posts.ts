import type { Client } from '@medusajs/js-sdk';

export type SocialGalleryMediaType = 'image' | 'video' | 'carousel';
export type SocialGalleryCategory = 'dishes' | 'private_dinners' | 'events' | 'behind_the_scenes' | 'press_collabs';
export type SocialGalleryDisplayStyle = 'normal' | 'large' | 'wide' | 'feature';

export interface AdminSocialGalleryPostDTO {
  id: string;
  title: string;
  caption?: string | null;
  source_url?: string | null;
  instagram_handle?: string | null;
  posted_at?: string | null;
  media_type: SocialGalleryMediaType;
  media_url?: string | null;
  thumbnail_url?: string | null;
  poster_url?: string | null;
  alt_text?: string | null;
  category: SocialGalleryCategory;
  display_style: SocialGalleryDisplayStyle;
  linked_service_label?: string | null;
  cta_label?: string | null;
  cta_url?: string | null;
  is_active: boolean;
  is_featured: boolean;
  sort_order: number;
  created_at: string;
  updated_at: string;
}

export interface AdminCreateSocialGalleryPostDTO {
  title: string;
  caption?: string | null;
  source_url?: string | null;
  instagram_handle?: string | null;
  posted_at?: string | null;
  media_type?: SocialGalleryMediaType;
  media_url?: string | null;
  thumbnail_url?: string | null;
  poster_url?: string | null;
  alt_text?: string | null;
  category?: SocialGalleryCategory;
  display_style?: SocialGalleryDisplayStyle;
  linked_service_label?: string | null;
  cta_label?: string | null;
  cta_url?: string | null;
  is_active?: boolean;
  is_featured?: boolean;
  sort_order?: number;
}

export type AdminUpdateSocialGalleryPostDTO = Partial<AdminCreateSocialGalleryPostDTO>;

export interface AdminSocialGalleryPostsResponse {
  social_gallery_posts: AdminSocialGalleryPostDTO[];
}

export class AdminSocialGalleryPostsResource {
  constructor(private client: Client) {}

  async list(query: Record<string, any> = {}) {
    return this.client.fetch<AdminSocialGalleryPostsResponse>('/admin/social-gallery-posts', {
      method: 'GET',
      query,
    });
  }

  async retrieve(id: string) {
    const response = await this.client.fetch<{ social_gallery_post: AdminSocialGalleryPostDTO }>(
      `/admin/social-gallery-posts/${id}`,
      { method: 'GET' },
    );
    return response.social_gallery_post;
  }

  async create(data: AdminCreateSocialGalleryPostDTO) {
    const response = await this.client.fetch<{ social_gallery_post: AdminSocialGalleryPostDTO }>(
      '/admin/social-gallery-posts',
      {
        method: 'POST',
        body: data,
      },
    );
    return response.social_gallery_post;
  }

  async update(id: string, data: AdminUpdateSocialGalleryPostDTO) {
    const response = await this.client.fetch<{ social_gallery_post: AdminSocialGalleryPostDTO }>(
      `/admin/social-gallery-posts/${id}`,
      {
        method: 'PUT',
        body: data,
      },
    );
    return response.social_gallery_post;
  }

  async delete(id: string) {
    return this.client.fetch<{ id: string; deleted: boolean }>(`/admin/social-gallery-posts/${id}`, {
      method: 'DELETE',
    });
  }
}
