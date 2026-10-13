import { MedusaRequest, MedusaResponse } from '@medusajs/framework/http';
import { SOCIAL_GALLERY_MODULE } from '../../../../modules/social-gallery';
import type SocialGalleryModuleService from '../../../../modules/social-gallery/service';
import { adminPost, curationSchema, publicationError } from '../../../../lib/social-gallery/contracts';

export async function GET(req: MedusaRequest, res: MedusaResponse) {
  const svc = req.scope.resolve<SocialGalleryModuleService>(SOCIAL_GALLERY_MODULE);
  try {
    return res.json({ social_gallery_post: adminPost(await svc.retrieveSocialGalleryPost(req.params.id)) });
  } catch {
    return res.status(404).json({ message: 'Gallery post not found.' });
  }
}

export async function PUT(req: MedusaRequest, res: MedusaResponse) {
  const parsed = curationSchema.partial().safeParse(req.body);
  if (!parsed.success)
    return res.status(400).json({ message: 'Invalid gallery content.', errors: parsed.error.issues });
  const svc = req.scope.resolve<SocialGalleryModuleService>(SOCIAL_GALLERY_MODULE);
  const existing = await svc.retrieveSocialGalleryPost(req.params.id);
  const changes = parsed.data;
  // Imported asset URLs/IDs are managed by ingestion, never by the curation form.
  if (existing.provider === 'instagram') {
    for (const field of ['media_type', 'media_url', 'poster_url', 'thumbnail_url'] as const) delete changes[field];
  }
  const merged = { ...existing, ...changes };
  const error = publicationError(merged);
  if (error) return res.status(400).json({ message: error });
  const social_gallery_post = await svc.updateSocialGalleryPosts({
    id: req.params.id,
    ...changes,
    ...(Object.prototype.hasOwnProperty.call(changes, 'posted_at')
      ? { posted_at: changes.posted_at ? new Date(changes.posted_at) : null }
      : { posted_at: existing.posted_at }),
  });
  return res.json({ social_gallery_post: adminPost(social_gallery_post) });
}

export async function DELETE(req: MedusaRequest, res: MedusaResponse) {
  const svc = req.scope.resolve<SocialGalleryModuleService>(SOCIAL_GALLERY_MODULE);
  // Retain a tombstone so the next profile import does not resurrect removed content.
  await svc.updateSocialGalleryPosts({ id: req.params.id, import_status: 'archived', is_active: false });
  return res.json({ id: req.params.id, deleted: true });
}
