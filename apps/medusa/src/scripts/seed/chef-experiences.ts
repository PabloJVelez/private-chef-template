/**
 * Chef experience seed data — US-only (USD pricing).
 * Extracted and adapted from old-scripts/seed/menus.ts.
 */
import type {
  CreateProductWorkflowInputDTO,
  ProductCollectionDTO,
  ProductTagDTO,
} from '@medusajs/framework/types';
import { ProductStatus } from '@medusajs/framework/utils';
import {
  menuProductData,
  menuDefinitions,
  seedMenuEntities,
} from '../old-scripts/seed/menus';

export { menuDefinitions, seedMenuEntities };

function buildMenuProductDataUsd({
  sales_channels,
  sku,
  prices: { usd },
  availableTickets,
  eventType,
  estimatedDuration,
  maxGuests,
}: {
  sales_channels: { id: string }[];
  sku: string;
  prices: { usd: number };
  availableTickets: number;
  eventType: string;
  estimatedDuration: number;
  maxGuests: number;
}) {
  return {
    options: [
      { title: 'Event Type', values: [eventType] },
      { title: 'Max Guests', values: [maxGuests.toString()] },
    ],
    sales_channels: sales_channels.map(({ id }) => ({ id })),
    variants: [
      {
        title: `${eventType} Experience`,
        sku: `${sku}-EXPERIENCE`,
        options: { 'Event Type': eventType, 'Max Guests': maxGuests.toString() },
        manage_inventory: false,
        prices: [{ amount: usd * 100, currency_code: 'usd' }],
      },
    ],
    metadata: {
      event_type: eventType,
      estimated_duration: estimatedDuration,
      max_guests: maxGuests,
      available_tickets: availableTickets,
      is_menu_experience: true,
    },
  };
}

export function seedMenuProductsUsd({
  collections,
  tags,
  sales_channels,
  categories,
  shipping_profile_id,
  experience_type_id,
}: {
  collections: ProductCollectionDTO[];
  tags: ProductTagDTO[];
  categories: { id: string; name: string }[];
  sales_channels: { id: string }[];
  shipping_profile_id: string;
  experience_type_id: string;
}): CreateProductWorkflowInputDTO[] {
  const chefExpCollection = collections.find((c) => c.title === 'Chef Experiences');
  const chefExpCategory = categories.filter((c) => c.name === 'Chef Experiences');
  const chefTags = tags.filter((t) =>
    ['Chef Experience', 'Limited Availability'].includes(t.value),
  );

  return menuProductData.map((mp) => {
    const sku = mp.handle.toUpperCase().replace(/-/g, '_');
    return {
      title: mp.title,
      description: mp.description,
      handle: mp.handle,
      status: ProductStatus.PUBLISHED,
      category_ids: chefExpCategory.map((c) => c.id),
      tag_ids: chefTags.map((t) => t.id),
      thumbnail: mp.images[0],
      collection_id: chefExpCollection?.id,
      shipping_profile_id,
      type_id: experience_type_id,
      images: mp.images.map((url) => ({ url })),
      ...buildMenuProductDataUsd({
        sales_channels,
        sku,
        prices: { usd: mp.price.usd },
        availableTickets: mp.availableTickets,
        eventType: mp.eventType,
        estimatedDuration: mp.estimatedDuration,
        maxGuests: mp.maxGuests,
      }),
    };
  });
}
