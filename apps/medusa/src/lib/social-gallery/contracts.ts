import { z } from 'zod';

export const httpsUrl = z
  .string()
  .max(4096)
  .url()
  .refine((value) => {
    try {
      const url = new URL(value);
      return url.protocol === 'https:' && !url.username && !url.password && !/[\\\u0000-\u0020]/.test(value);
    } catch {
      return false;
    }
  }, 'Use an HTTPS URL without credentials.');

// Local file-provider previews remain usable in development. Production media is HTTPS.
export const mediaUrl = z
  .string()
  .max(4096)
  .url()
  .refine((value) => {
    try {
      const url = new URL(value);
      const local =
        process.env.NODE_ENV !== 'production' &&
        url.protocol === 'http:' &&
        ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
      return (url.protocol === 'https:' || local) && !url.username && !url.password && !/[\\\u0000-\u0020]/.test(value);
    } catch {
      return false;
    }
  }, 'Use HTTPS media (or a local file-provider URL in development).');

export const destinationUrl = z
  .string()
  .max(2048)
  .refine(
    (value) => (/^\/(?!\/)/.test(value) && !/[\\\u0000-\u0020]/.test(value)) || httpsUrl.safeParse(value).success,
    'Use a site-relative path or HTTPS URL.',
  );

export const assetSchema = z.object({
  type: z.enum(['image', 'video']),
  url: mediaUrl,
  poster_url: mediaUrl.nullable().optional(),
  file_id: z.string().min(1).optional(),
  poster_file_id: z.string().min(1).nullable().optional(),
  width: z.number().int().positive().max(30000).nullable().optional(),
  height: z.number().int().positive().max(30000).nullable().optional(),
});
export type GalleryAsset = z.infer<typeof assetSchema>;
export const storedAssets = (value: unknown): GalleryAsset[] => {
  const parsed = z.object({ items: z.array(assetSchema).max(20) }).safeParse(value);
  return parsed.success ? parsed.data.items : [];
};
export const adminPost = <T extends { media_assets?: unknown }>(post: T) => ({
  ...post,
  media_assets: storedAssets(post.media_assets),
});

export const importedPostSchema = z.object({
  id: z.string().min(1).max(128),
  shortcode: z.string().min(1).max(64),
  permalink: httpsUrl,
  handle: z.string().max(30).nullable(),
  caption: z.string().max(20000),
  posted_at: z.string().datetime({ offset: true }).nullable(),
  assets: z.array(assetSchema).min(1).max(20),
});
export type ImportedPost = z.infer<typeof importedPostSchema>;

export class ImportError extends Error {
  constructor(
    public code: string,
    message: string,
    public retryable = false,
  ) {
    super(message);
    this.name = 'ImportError';
  }
}

export const categorySchema = z.enum(['dishes', 'private_dinners', 'events', 'behind_the_scenes', 'press_collabs']);
const nullableText = (max: number) => z.string().max(max).nullable().optional();
const nullableUrl = httpsUrl.nullable().optional();
export const curationSchema = z.object({
  title: z.string().trim().min(1).max(200),
  caption: nullableText(20000),
  source_url: nullableUrl,
  instagram_handle: z.string().max(30).nullable().optional(),
  posted_at: z
    .string()
    .refine((value) => /^\d{4}-\d{2}-\d{2}(?:T.*)?$/.test(value) && Number.isFinite(Date.parse(value)), 'Invalid date.')
    .nullable()
    .optional(),
  media_type: z.enum(['image', 'video', 'carousel']),
  media_url: mediaUrl.nullable().optional(),
  thumbnail_url: mediaUrl.nullable().optional(),
  poster_url: mediaUrl.nullable().optional(),
  alt_text: nullableText(500),
  category: categorySchema,
  display_style: z.enum(['normal', 'large', 'wide', 'feature']),
  linked_service_label: nullableText(120),
  cta_label: nullableText(120),
  cta_url: destinationUrl.nullable().optional(),
  is_active: z.boolean(),
  is_featured: z.boolean(),
  import_status: z.enum(['draft', 'published', 'archived']),
  sort_order: z.number().int().min(0).max(100000),
});

export const publicationError = (post: Record<string, unknown>): string | null => {
  if (post.is_active !== (post.import_status === 'published')) return 'Publication status and visibility must agree.';
  if (post.import_status !== 'published') return null;
  if (!mediaUrl.safeParse(post.media_url).success) return 'Add usable media before publishing.';
  if (post.provider === 'instagram' || post.media_type === 'carousel') {
    const assets = z.array(assetSchema).min(1).max(20).safeParse(storedAssets(post.media_assets));
    if (!assets.success || (post.provider === 'instagram' && assets.data.some((asset) => !asset.file_id))) {
      return 'Import and store this post’s media before publishing.';
    }
  }
  return null;
};

/** Explicit public serialization. Never expose raw provider results or file IDs. */
export const publicPost = (post: Record<string, any>) => {
  const fields = [
    'id',
    'title',
    'caption',
    'source_url',
    'instagram_handle',
    'posted_at',
    'media_type',
    'media_url',
    'thumbnail_url',
    'poster_url',
    'alt_text',
    'category',
    'display_style',
    'linked_service_label',
    'cta_label',
    'cta_url',
    'is_active',
    'is_featured',
    'sort_order',
  ] as const;
  const result = Object.fromEntries(fields.map((key) => [key, post[key]]));
  const assets = z.array(assetSchema).safeParse(storedAssets(post.media_assets));
  return {
    ...result,
    media_assets: assets.success ? assets.data.map(({ file_id, poster_file_id, ...asset }) => asset) : [],
  };
};

export const listQuery = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(24),
  offset: z.coerce.number().int().min(0).max(100000).default(0),
});
