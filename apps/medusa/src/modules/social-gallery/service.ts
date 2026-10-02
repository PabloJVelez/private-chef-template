import { MedusaService } from '@medusajs/framework/utils';
import SocialGalleryPost from './models/social-gallery-post';

class SocialGalleryModuleService extends MedusaService({
  SocialGalleryPost,
}) {
  async listActiveSocialGalleryPosts() {
    return this.listSocialGalleryPosts(
      { is_active: true },
      {
        order: {
          is_featured: 'DESC',
          sort_order: 'ASC',
          posted_at: 'DESC',
        },
      },
    );
  }
}

export default SocialGalleryModuleService;
