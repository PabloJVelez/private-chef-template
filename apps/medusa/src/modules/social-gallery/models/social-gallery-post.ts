import { model } from '@medusajs/framework/utils';

export const SocialGalleryPost = model.define('social_gallery_post', {
  id: model.id().primaryKey(),

  title: model.text(),
  caption: model.text().nullable(),
  source_url: model.text().nullable(),
  instagram_handle: model.text().nullable(),
  posted_at: model.dateTime().nullable(),

  media_type: model.enum(['image', 'video', 'carousel']).default('image'),
  media_url: model.text().nullable(),
  thumbnail_url: model.text().nullable(),
  poster_url: model.text().nullable(),
  alt_text: model.text().nullable(),

  category: model.enum(['dishes', 'private_dinners', 'events', 'behind_the_scenes', 'press_collabs']).default('dishes'),
  display_style: model.enum(['normal', 'large', 'wide', 'feature']).default('normal'),

  linked_service_label: model.text().nullable(),
  cta_label: model.text().nullable(),
  cta_url: model.text().nullable(),

  is_active: model.boolean().default(true),
  is_featured: model.boolean().default(false),
  sort_order: model.number().default(0),
});

export default SocialGalleryPost;
