import { MedusaRequest, MedusaResponse } from '@medusajs/framework/http';
import { z } from 'zod';
import { SOCIAL_GALLERY_MODULE } from '../../../modules/social-gallery';
import type SocialGalleryModuleService from '../../../modules/social-gallery/service';
import {
  normalizeInstagramSource,
  scrapeSocialMetadata,
  titleFromInstagramSource,
} from '../../../lib/social-gallery/instagram';

const socialGalleryPostSchema = z.object({
  title: z.string().optional(),
  caption: z.string().optional().nullable(),
  source_url: z.string().optional().nullable(),
  instagram_handle: z.string().optional().nullable(),
  provider: z.enum(['instagram', 'manual']).optional(),
  provider_media_id: z.string().optional().nullable(),
  shortcode: z.string().optional().nullable(),
  permalink: z.string().optional().nullable(),
  import_status: z.enum(['draft', 'published', 'archived']).optional(),
  raw_provider_data: z.any().optional().nullable(),
  content_hash: z.string().optional().nullable(),
  posted_at: z.string().optional().nullable(),
  media_type: z.enum(['image', 'video', 'carousel']).optional(),
  media_url: z.string().optional().nullable(),
  thumbnail_url: z.string().optional().nullable(),
  poster_url: z.string().optional().nullable(),
  alt_text: z.string().optional().nullable(),
  category: z.enum(['dishes', 'private_dinners', 'events', 'behind_the_scenes', 'press_collabs']).optional(),
  display_style: z.enum(['normal', 'large', 'wide', 'feature']).optional(),
  linked_service_label: z.string().optional().nullable(),
  cta_label: z.string().optional().nullable(),
  cta_url: z.string().optional().nullable(),
  is_active: z.boolean().optional(),
  is_featured: z.boolean().optional(),
  sort_order: z.number().optional(),
}).refine((data) => !!data.source_url || !!data.media_url, {
  message: 'Either a social link or media URL is required.',
  path: ['source_url'],
});

const handleFromSocialUrl = (sourceUrl?: string | null) => {
  if (!sourceUrl) return '';

  try {
    const source = normalizeInstagramSource(sourceUrl);
    if (source.kind === 'profile') return source.handle || '';

    const url = new URL(sourceUrl);
    const pathParts = url.pathname.split('/').filter(Boolean);
    if (url.hostname.includes('tiktok.com')) {
      return pathParts.find((part) => part.startsWith('@'))?.replace('@', '') ?? '';
    }
  } catch {
    return '';
  }

  return '';
};

const isProfileUrl = (sourceUrl?: string | null) => {
  if (!sourceUrl) return false;

  try {
    return normalizeInstagramSource(sourceUrl).kind === 'profile';
  } catch {
    // Fall back to the older TikTok-aware behavior for manual legacy posts.
    const url = new URL(sourceUrl);
    const pathParts = url.pathname.split('/').filter(Boolean);
    if (url.hostname.includes('tiktok.com')) return pathParts.some((part) => part.startsWith('@')) && !pathParts.includes('video');
  }

  return false;
};

const titleFromSocialUrl = (sourceUrl?: string | null) => {
  if (!sourceUrl) return 'Social post';
  try {
    return titleFromInstagramSource(normalizeInstagramSource(sourceUrl));
  } catch {
    // Fall through to legacy labels.
  }
  const handle = handleFromSocialUrl(sourceUrl);
  if (isProfileUrl(sourceUrl) && handle) return `Social profile @${handle}`;
  if (sourceUrl.includes('instagram.com/reel')) return 'Instagram Reel';
  if (sourceUrl.includes('instagram.com')) return 'Instagram post';
  if (sourceUrl.includes('tiktok.com')) return 'TikTok post';
  return 'Social post';
};

const toPayload = async (data: z.infer<typeof socialGalleryPostSchema>) => {
  const metadata = await scrapeSocialMetadata(data.source_url);
  const mediaUrl = data.media_url || metadata.video || metadata.image || '';

  return {
    ...(data as any),
    title: data.title || metadata.title || titleFromSocialUrl(data.source_url),
    caption: data.caption || metadata.caption || null,
    instagram_handle: data.instagram_handle || handleFromSocialUrl(data.source_url) || null,
    provider: data.provider || (data.source_url?.includes('instagram.com') ? 'instagram' : 'manual'),
    import_status: data.import_status || 'published',
    media_type: data.media_type || (metadata.video ? 'video' : 'image'),
    media_url: mediaUrl,
    thumbnail_url: data.thumbnail_url || (!metadata.video ? metadata.image : null),
    poster_url: data.poster_url || (metadata.video ? metadata.image : null),
    alt_text: data.alt_text || data.title || metadata.title || titleFromSocialUrl(data.source_url),
    posted_at: data.posted_at ? new Date(data.posted_at) : null,
    category: data.category || (isProfileUrl(data.source_url) ? 'behind_the_scenes' : 'dishes'),
  };
};

export async function GET(req: MedusaRequest, res: MedusaResponse) {
  const svc = req.scope.resolve(SOCIAL_GALLERY_MODULE) as SocialGalleryModuleService;

  const social_gallery_posts = await svc.listSocialGalleryPosts(
    {},
    {
      order: {
        is_featured: 'DESC',
        sort_order: 'ASC',
        posted_at: 'DESC',
      },
    },
  );

  res.status(200).json({ social_gallery_posts });
}

export async function POST(req: MedusaRequest, res: MedusaResponse) {
  const svc = req.scope.resolve(SOCIAL_GALLERY_MODULE) as SocialGalleryModuleService;
  const parsed = socialGalleryPostSchema.safeParse(req.body);

  if (!parsed.success) {
    return res.status(400).json({ message: 'Validation error', errors: parsed.error.issues });
  }

  const social_gallery_post = await svc.createSocialGalleryPosts(await toPayload(parsed.data));

  res.status(201).json({ social_gallery_post });
}
