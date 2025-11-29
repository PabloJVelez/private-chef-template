import { SiteSettings } from '@libs/types';
import { config } from '@libs/util/server/config.server';
import { getChefConfig } from '../chef/chef-config';

const chefConfig = getChefConfig();

export const siteSettings: SiteSettings = {
  storefront_url: config.STOREFRONT_URL,
  description: chefConfig.seo.description,
  favicon: '/favicon.jpg',
  social_facebook: '',
  social_instagram: '',
  social_twitter: '',
};
