import { MedusaRequest, MedusaResponse } from '@medusajs/framework/http';
import { SOCIAL_GALLERY_MODULE } from '../../../modules/social-gallery';
import type SocialGalleryModuleService from '../../../modules/social-gallery/service';
import { adminPost, curationSchema, listQuery, publicationError } from '../../../lib/social-gallery/contracts';

export async function GET(req: MedusaRequest, res: MedusaResponse) {
  const query = listQuery.safeParse(req.query);
  if (!query.success) return res.status(400).json({ message: 'Invalid pagination.' });
  const svc = req.scope.resolve<SocialGalleryModuleService>(SOCIAL_GALLERY_MODULE);
  const [social_gallery_posts, count] = await svc.listAndCountSocialGalleryPosts(
    { import_status: ['draft', 'published'] },
    {
      order: { is_featured: 'DESC', sort_order: 'ASC', posted_at: 'DESC', id: 'ASC' },
      take: query.data.limit,
      skip: query.data.offset,
    },
  );
  return res.json({ social_gallery_posts: social_gallery_posts.map(adminPost), count, ...query.data });
}

export async function POST(req: MedusaRequest, res: MedusaResponse) {
  const parsed = curationSchema.safeParse({
    media_type: 'image',
    category: 'dishes',
    display_style: 'normal',
    import_status: 'draft',
    is_active: false,
    is_featured: false,
    sort_order: 0,
    ...(req.body as object),
  });
  if (!parsed.success)
    return res.status(400).json({ message: 'Invalid gallery content.', errors: parsed.error.issues });
  const payload = { ...parsed.data, provider: 'manual' as const };
  const error = publicationError(payload);
  if (error) return res.status(400).json({ message: error });
  if (payload.media_type === 'carousel')
    return res.status(400).json({ message: 'Import an Instagram carousel to add multiple media items.' });
  const svc = req.scope.resolve<SocialGalleryModuleService>(SOCIAL_GALLERY_MODULE);
  // Saving manual content never makes an outbound request.
  const social_gallery_post = await svc.createSocialGalleryPosts({
    ...payload,
    posted_at: payload.posted_at ? new Date(payload.posted_at) : null,
  });
  return res.status(201).json({ social_gallery_post: adminPost(social_gallery_post) });
}
