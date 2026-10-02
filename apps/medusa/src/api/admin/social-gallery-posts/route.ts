import { MedusaRequest, MedusaResponse } from '@medusajs/framework/http';
import { z } from 'zod';
import { SOCIAL_GALLERY_MODULE } from '../../../modules/social-gallery';
import type SocialGalleryModuleService from '../../../modules/social-gallery/service';

const socialGalleryPostSchema = z.object({
  title: z.string().min(1),
  caption: z.string().optional().nullable(),
  source_url: z.string().optional().nullable(),
  instagram_handle: z.string().optional().nullable(),
  posted_at: z.string().optional().nullable(),
  media_type: z.enum(['image', 'video', 'carousel']).optional(),
  media_url: z.string().min(1),
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

const toPayload = (data: z.infer<typeof socialGalleryPostSchema>) => ({
  ...(data as any),
  posted_at: data.posted_at ? new Date(data.posted_at) : null,
});

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

  const social_gallery_post = await svc.createSocialGalleryPosts(toPayload(parsed.data));

  res.status(201).json({ social_gallery_post });
}
