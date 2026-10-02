import { MedusaService } from '@medusajs/framework/utils';
import SocialAccount from './models/social-account';
import SocialGalleryPost from './models/social-gallery-post';
import SocialImportJob from './models/social-import-job';

class SocialGalleryModuleService extends MedusaService({
  SocialAccount,
  SocialGalleryPost,
  SocialImportJob,
}) {
  async listActiveSocialGalleryPosts() {
    return this.listSocialGalleryPosts(
      { is_active: true, import_status: 'published' },
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
