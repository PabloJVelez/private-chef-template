import type { Client } from '@medusajs/js-sdk';

export type SocialGalleryMediaType = 'image' | 'video' | 'carousel';
export type SocialGalleryCategory = 'dishes' | 'private_dinners' | 'events' | 'behind_the_scenes' | 'press_collabs';
export type SocialGalleryDisplayStyle = 'normal' | 'large' | 'wide' | 'feature';
export type SocialGalleryProvider = 'instagram' | 'manual';
export type SocialGalleryImportStatus = 'draft' | 'published' | 'archived';
export type SocialImportJobStatus = 'queued' | 'running' | 'completed' | 'failed' | 'needs_connection';
export type SocialAccountStatus = 'needs_connection' | 'connected' | 'import_limited' | 'active' | 'error';

export interface AdminSocialGalleryPostDTO {
  id: string;
  title: string;
  caption?: string | null;
  source_url?: string | null;
  instagram_handle?: string | null;
  provider: SocialGalleryProvider;
  provider_media_id?: string | null;
  shortcode?: string | null;
  permalink?: string | null;
  import_status: SocialGalleryImportStatus;
  raw_provider_data?: unknown | null;
  content_hash?: string | null;
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
  provider?: SocialGalleryProvider;
  provider_media_id?: string | null;
  shortcode?: string | null;
  permalink?: string | null;
  import_status?: SocialGalleryImportStatus;
  raw_provider_data?: unknown | null;
  content_hash?: string | null;
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

export interface AdminSocialAccountDTO {
  id: string;
  provider: 'instagram';
  handle: string;
  profile_url: string;
  status: SocialAccountStatus;
  last_synced_at?: string | null;
  last_error?: string | null;
  metadata?: unknown | null;
  created_at: string;
  updated_at: string;
}

export interface AdminSocialImportJobDTO {
  id: string;
  provider: 'instagram';
  account_id?: string | null;
  source_url: string;
  handle?: string | null;
  status: SocialImportJobStatus;
  imported_count: number;
  message?: string | null;
  error_message?: string | null;
  raw_result?: unknown | null;
  completed_at?: string | null;
  created_at: string;
  updated_at: string;
}

export interface AdminCreateSocialImportDTO {
  source: string;
  category?: SocialGalleryCategory;
  cta_label?: string | null;
  cta_url?: string | null;
}

export interface AdminSocialGalleryImportsResponse {
  social_import_jobs: AdminSocialImportJobDTO[];
  social_accounts: AdminSocialAccountDTO[];
}

export interface AdminCreateSocialImportResponse {
  social_import_job: AdminSocialImportJobDTO;
  social_account?: AdminSocialAccountDTO | null;
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

export class AdminSocialGalleryImportsResource {
  constructor(private client: Client) {}

  async list(query: Record<string, any> = {}) {
    return this.client.fetch<AdminSocialGalleryImportsResponse>('/admin/social-gallery-imports', {
      method: 'GET',
      query,
    });
  }

  async create(data: AdminCreateSocialImportDTO) {
    return this.client.fetch<AdminCreateSocialImportResponse>('/admin/social-gallery-imports', {
      method: 'POST',
      body: data,
    });
  }
}
