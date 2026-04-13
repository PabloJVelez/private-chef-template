import type { StoreExperienceTypeDTO } from '@libs/util/server/data/experience-types.server';
import type { StoreMenuDTO } from '@libs/util/server/data/menus.server';

/** @deprecated Legacy fallback only — use menu × experience pricing instead. */
export const PRICING_STRUCTURE = {
  buffet_style: 99.99,
  cooking_class: 119.99,
  plated_dinner: 149.99,
} as const;

export type EventType = keyof typeof PRICING_STRUCTURE;

/** Map experience slug (e.g. buffet-style) to legacy pricing key. */
export function legacyPricingKeyFromSlug(slug: string): EventType | null {
  const normalized = slug.replace(/-/g, '_');
  if (normalized in PRICING_STRUCTURE) return normalized as EventType;
  return null;
}

export function isLegacyEventTypeKey(value: string): value is EventType {
  return value === 'buffet_style' || value === 'cooking_class' || value === 'plated_dinner';
}

export const getEventTypeDisplayName = (eventType: string): string => {
  if (isLegacyEventTypeKey(eventType)) {
    switch (eventType) {
      case 'cooking_class':
        return 'Cooking Class';
      case 'plated_dinner':
        return 'Plated Dinner';
      case 'buffet_style':
        return 'Buffet Style';
    }
  }
  return eventType || 'Experience';
};

export const getEventTypeEstimatedDuration = (eventType: string): number => {
  if (isLegacyEventTypeKey(eventType)) {
    switch (eventType) {
      case 'cooking_class':
        return 3;
      case 'plated_dinner':
        return 4;
      case 'buffet_style':
        return 2.5;
    }
  }
  return 3;
};

/**
 * Look up the per-person price (in cents) from the menu × experience pricing matrix.
 * Returns null if no matching pricing row exists.
 */
export function getMenuExperiencePrice(
  menus: StoreMenuDTO[],
  menuId: string | undefined,
  experienceTypeId: string | undefined
): number | null {
  if (!menuId || !experienceTypeId) return null;
  const menu = menus.find((m) => m.id === menuId);
  if (!menu?.menu_experience_prices?.length) return null;
  const row = menu.menu_experience_prices.find(
    (p) => p.experience_type_id === experienceTypeId
  );
  if (!row) return null;
  return Number(row.price_per_person);
}

/**
 * Estimate $/person for the request form.
 * Priority: menu × experience pricing → catalog price_per_unit → legacy fallback.
 */
export function estimatePricePerPersonForRequest(params: {
  eventType: string;
  experienceTypeId?: string;
  experienceTypes: StoreExperienceTypeDTO[];
  menus?: StoreMenuDTO[];
  menuId?: string;
}): number {
  const { eventType, experienceTypeId, experienceTypes, menus, menuId } = params;

  // 1. Menu × experience pricing (cents → dollars)
  if (menus && menuId && experienceTypeId) {
    const cents = getMenuExperiencePrice(menus, menuId, experienceTypeId);
    if (cents != null && cents > 0) {
      return cents / 100;
    }
  }

  // 2. Catalog price_per_unit
  const row = experienceTypeId ? experienceTypes.find((t) => t.id === experienceTypeId) : undefined;
  if (row?.price_per_unit != null) {
    return Number(row.price_per_unit) / 100;
  }

  // 3. Legacy slug → PRICING_STRUCTURE
  if (row?.slug) {
    const key = legacyPricingKeyFromSlug(row.slug);
    if (key) return PRICING_STRUCTURE[key];
  }

  // 4. Legacy eventType → PRICING_STRUCTURE
  if (isLegacyEventTypeKey(eventType)) {
    return PRICING_STRUCTURE[eventType];
  }

  return PRICING_STRUCTURE.plated_dinner;
}
