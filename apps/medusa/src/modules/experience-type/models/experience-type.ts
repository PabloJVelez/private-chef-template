import { model } from '@medusajs/framework/utils';

export const ExperienceType = model.define('experience_type', {
  id: model.id().primaryKey(),

  name: model.text(),
  slug: model.text().unique(),
  description: model.text(),
  short_description: model.text().nullable(),

  icon: model.text().nullable(),
  image_url: model.text().nullable(),
  highlights: model.json().nullable(), // string[]
  ideal_for: model.text().nullable(),

  pricing_type: model.enum(['per_person', 'per_item', 'product_based']).default('per_person'),
  price_per_unit: model.bigNumber().nullable(),

  duration_minutes: model.number().nullable(),
  duration_display: model.text().nullable(),

  is_product_based: model.boolean().default(false),
  location_type: model.enum(['customer', 'fixed']).default('customer'),
  fixed_location_address: model.text().nullable(),

  requires_advance_notice: model.boolean().default(true),
  advance_notice_days: model.number().default(7),

  available_time_slots: model.json().nullable(),
  time_slot_start: model.text().nullable(),
  time_slot_end: model.text().nullable(),
  time_slot_interval_minutes: model.number().default(30),

  min_party_size: model.number().default(1),
  max_party_size: model.number().nullable(),

  workflow_event_type: model.enum(['cooking_class', 'plated_dinner', 'buffet_style']).default('plated_dinner'),

  is_active: model.boolean().default(true),
  is_featured: model.boolean().default(false),
  sort_order: model.number().default(0),
});

export default ExperienceType;
