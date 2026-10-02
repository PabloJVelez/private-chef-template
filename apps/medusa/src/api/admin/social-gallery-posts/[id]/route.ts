import { MedusaRequest, MedusaResponse } from '@medusajs/framework/http';
import { z } from 'zod';
import { SOCIAL_GALLERY_MODULE } from '../../../../modules/social-gallery';
import type SocialGalleryModuleService from '../../../../modules/social-gallery/service';

const updateSchema = z.object({
  title: z.string().min(1).optional(),
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
});

const toPayload = (data: z.infer<typeof updateSchema>) => ({
  ...(data as any),
  ...(Object.prototype.hasOwnProperty.call(data, 'posted_at')
    ? { posted_at: data.posted_at ? new Date(data.posted_at) : null }
    : {}),
});

export async function GET(req: MedusaRequest, res: MedusaResponse) {
  const svc = req.scope.resolve(SOCIAL_GALLERY_MODULE) as SocialGalleryModuleService;

  try {
    const social_gallery_post = await svc.retrieveSocialGalleryPost(req.params.id);
    res.status(200).json({ social_gallery_post });
  } catch {
    res.status(404).json({ message: 'Social gallery post not found' });
  }
}

export async function PUT(req: MedusaRequest, res: MedusaResponse) {
  const svc = req.scope.resolve(SOCIAL_GALLERY_MODULE) as SocialGalleryModuleService;
  const parsed = updateSchema.safeParse(req.body);

  if (!parsed.success) {
    return res.status(400).json({ message: 'Validation error', errors: parsed.error.issues });
  }

  const social_gallery_post = await svc.updateSocialGalleryPosts({
    id: req.params.id,
    ...toPayload(parsed.data),
  } as any);

  res.status(200).json({ social_gallery_post });
}

export async function DELETE(req: MedusaRequest, res: MedusaResponse) {
  const svc = req.scope.resolve(SOCIAL_GALLERY_MODULE) as SocialGalleryModuleService;

  await svc.deleteSocialGalleryPosts(req.params.id);

  res.status(200).json({ id: req.params.id, deleted: true });
}
