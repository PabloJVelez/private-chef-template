import { MedusaRequest, MedusaResponse } from '@medusajs/framework/http';
import { z } from 'zod';
import { SOCIAL_GALLERY_MODULE } from '../../../modules/social-gallery';
import type SocialGalleryModuleService from '../../../modules/social-gallery/service';

const socialGalleryPostSchema = z.object({
  title: z.string().optional(),
  caption: z.string().optional().nullable(),
  source_url: z.string().optional().nullable(),
  instagram_handle: z.string().optional().nullable(),
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

const decodeHtml = (value?: string | null) =>
  value
    ?.replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#039;/g, "'")
    .replace(/&#x27;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .trim() || '';

const getMetaContent = (html: string, property: string) => {
  const escaped = property.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const patterns = [
    new RegExp(`<meta[^>]+property=["']${escaped}["'][^>]+content=["']([^"']+)["'][^>]*>`, 'i'),
    new RegExp(`<meta[^>]+name=["']${escaped}["'][^>]+content=["']([^"']+)["'][^>]*>`, 'i'),
    new RegExp(`<meta[^>]+content=["']([^"']+)["'][^>]+property=["']${escaped}["'][^>]*>`, 'i'),
    new RegExp(`<meta[^>]+content=["']([^"']+)["'][^>]+name=["']${escaped}["'][^>]*>`, 'i'),
  ];

  for (const pattern of patterns) {
    const match = html.match(pattern);
    if (match?.[1]) return decodeHtml(match[1]);
  }

  return '';
};

const handleFromSocialUrl = (sourceUrl?: string | null) => {
  if (!sourceUrl) return '';

  try {
    const url = new URL(sourceUrl);
    const pathParts = url.pathname.split('/').filter(Boolean);

    if (url.hostname.includes('instagram.com')) {
      if (pathParts[0] && !['p', 'reel', 'tv', 'stories'].includes(pathParts[0])) return pathParts[0].replace('@', '');
      return '';
    }

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
    const url = new URL(sourceUrl);
    const pathParts = url.pathname.split('/').filter(Boolean);
    if (url.hostname.includes('instagram.com')) return !!pathParts[0] && !['p', 'reel', 'tv', 'stories'].includes(pathParts[0]);
    if (url.hostname.includes('tiktok.com')) return pathParts.some((part) => part.startsWith('@')) && !pathParts.includes('video');
  } catch {
    return false;
  }

  return false;
};

const titleFromSocialUrl = (sourceUrl?: string | null) => {
  if (!sourceUrl) return 'Social post';
  const handle = handleFromSocialUrl(sourceUrl);
  if (isProfileUrl(sourceUrl) && handle) return `Social profile @${handle}`;
  if (sourceUrl.includes('instagram.com/reel')) return 'Instagram Reel';
  if (sourceUrl.includes('instagram.com')) return 'Instagram post';
  if (sourceUrl.includes('tiktok.com')) return 'TikTok post';
  return 'Social post';
};

const scrapeSocialMetadata = async (sourceUrl?: string | null) => {
  if (!sourceUrl) return {};

  try {
    const response = await fetch(sourceUrl, {
      headers: {
        'user-agent':
          'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36',
        accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      },
      redirect: 'follow',
    });

    if (!response.ok) return {};

    const html = await response.text();
    const image = getMetaContent(html, 'og:image') || getMetaContent(html, 'twitter:image');
    const video = getMetaContent(html, 'og:video') || getMetaContent(html, 'og:video:url');
    const description = getMetaContent(html, 'og:description') || getMetaContent(html, 'description');
    const title = getMetaContent(html, 'og:title') || getMetaContent(html, 'twitter:title');

    return {
      title,
      caption: description,
      image,
      video,
    };
  } catch (error) {
    console.warn('Social gallery metadata scrape failed', error);
    return {};
  }
};

const toPayload = async (data: z.infer<typeof socialGalleryPostSchema>) => {
  const metadata = await scrapeSocialMetadata(data.source_url);
  const mediaUrl = data.media_url || metadata.video || metadata.image || null;

  return {
    ...(data as any),
    title: data.title || metadata.title || titleFromSocialUrl(data.source_url),
    caption: data.caption || metadata.caption || null,
    instagram_handle: data.instagram_handle || handleFromSocialUrl(data.source_url) || null,
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
