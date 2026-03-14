/**
 * Chef experience seed data — US-only (USD pricing).
 * Extracted and adapted from old-scripts/seed/menus.ts.
 */
import type {
  CreateProductWorkflowInputDTO,
  ProductCollectionDTO,
  ProductTagDTO,
} from '@medusajs/framework/types';
import { ProductStatus } from '@medusajs/utils';
import {
  menuDefinitions,
  seedMenuEntities,
} from '../old-scripts/seed/menus';

export { menuDefinitions, seedMenuEntities };

interface MenuTicketProductDataUsd {
  title: string;
  description: string;
  handle: string;
  price: { usd: number };
  estimatedDuration: number;
  maxGuests: number;
  eventType: 'cooking_class' | 'plated_dinner' | 'buffet_style';
  images: string[];
  availableTickets: number;
}

const menuProductDataUsd: MenuTicketProductDataUsd[] = [
  {
    title: 'The Winter Table',
    description:
      'A refined winter tasting: cocktails, canapés, herb-crusted lamb or salmon, roasted roots, and chocolate peppermint mousse. Ideal for intimate holiday gatherings.',
    handle: 'the-winter-table',
    price: { usd: 125 },
    estimatedDuration: 180,
    maxGuests: 12,
    eventType: 'plated_dinner',
    images: [
      'https://images.unsplash.com/photo-1517248135467-4c7edcad34c4?w=800&q=80',
    ],
    availableTickets: 15,
  },
  {
    title: 'Salt & Sun',
    description:
      'Coastal-inspired dining: tropical cocktails, ceviche, mahi-mahi or herb chicken, coconut rice, and coconut lime tart. Perfect for a relaxed, elegant gathering.',
    handle: 'salt-and-sun',
    price: { usd: 110 },
    estimatedDuration: 165,
    maxGuests: 14,
    eventType: 'buffet_style',
    images: [
      'https://images.unsplash.com/photo-1559339352-11d035aa65de?w=800&q=80',
    ],
    availableTickets: 18,
  },
  {
    title: 'The Harvest Table',
    description:
      'Farm-to-table experience: bourbon cocktails, squash soup, roast or pesto-stuffed chicken, seasonal vegetables, wild rice, and apple crisp. A warm, convivial evening.',
    handle: 'the-harvest-table',
    price: { usd: 95 },
    estimatedDuration: 150,
    maxGuests: 16,
    eventType: 'cooking_class',
    images: [
      'https://images.unsplash.com/photo-1504674900247-0877df9cc836?w=800&q=80',
    ],
    availableTickets: 12,
  },
  {
    title: 'Noir & Blanc',
    description:
      'Upscale soirée: French 75 and blackberry fizz, caprese and salmon blinis, surf & turf or herb chicken, truffle mash, and tiramisu. For milestone celebrations.',
    handle: 'noir-and-blanc',
    price: { usd: 150 },
    estimatedDuration: 210,
    maxGuests: 10,
    eventType: 'plated_dinner',
    images: [
      'https://images.unsplash.com/photo-1414235077428-338989a2e8c0?w=800&q=80',
    ],
    availableTickets: 10,
  },
];

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

  return menuProductDataUsd.map((mp) => {
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
