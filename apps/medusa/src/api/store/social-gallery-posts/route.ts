import { MedusaRequest, MedusaResponse } from '@medusajs/framework/http';
import { SOCIAL_GALLERY_MODULE } from '../../../modules/social-gallery';
import type SocialGalleryModuleService from '../../../modules/social-gallery/service';

export async function GET(req: MedusaRequest, res: MedusaResponse) {
  const svc = req.scope.resolve(SOCIAL_GALLERY_MODULE) as SocialGalleryModuleService;

  const social_gallery_posts = await svc.listActiveSocialGalleryPosts();

  res.status(200).json({ social_gallery_posts });
}
