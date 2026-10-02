import { Module } from '@medusajs/framework/utils';
import SocialGalleryModuleService from './service';

export const SOCIAL_GALLERY_MODULE = 'socialGalleryModuleService';

export default Module(SOCIAL_GALLERY_MODULE, {
  service: SocialGalleryModuleService,
});
