import type { StoreExperienceTypeDTO } from '@libs/util/server/data/experience-types.server';
import type { StoreMenuDTO } from '@libs/util/server/data/menus.server';

/** @deprecated Legacy fallback only when no menu is selected on the request form. */
export const PRICING_STRUCTURE = {
  buffet_style: 99.99,
  cooking_class: 119.99,
  plated_dinner: 149.99,
  meal_prep: 89.99,
} as const;

export type EventType = keyof typeof PRICING_STRUCTURE;

/** Map experience slug (e.g. buffet-style) to legacy pricing key. */
export function legacyPricingKeyFromSlug(slug: string): EventType | null {
  const normalized = slug.replace(/-/g, '_');
  if (normalized in PRICING_STRUCTURE) return normalized as EventType;
  return null;
}

export function isLegacyEventTypeKey(value: string): value is EventType {
  return (
    value === 'buffet_style' ||
    value === 'cooking_class' ||
    value === 'plated_dinner' ||
    value === 'meal_prep'
  );
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
      case 'meal_prep':
        return 'Meal Prep';
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
      case 'meal_prep':
        return 2;
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
  experienceTypeId: string | undefined,
): number | null {
  if (!menuId || !experienceTypeId) return null;
  const menu = menus.find((m) => m.id === menuId);
  if (!menu?.menu_experience_prices?.length) return null;
  const row = menu.menu_experience_prices.find((p) => p.experience_type_id === experienceTypeId);
  if (!row) return null;
  return Number(row.price_per_person);
}

/** Shown when a menu + experience are selected but there is no per-person matrix price (TBD until chef accepts). */
export const MENU_EXPERIENCE_TBD_PRICING_MESSAGE = 'Chef will confirm pricing before your event is accepted.';

/**
 * Estimate $/person for the request form.
 *
 * When **both** `menuId` and `experienceTypeId` are set, only the menu × experience matrix applies.
 * If there is no row or the price is zero, returns `null` (do not fall back to legacy — avoids misleading quotes).
 *
 * When no menu is selected, uses catalog `price_per_unit` then legacy constants (custom-menu / edge paths).
 */
export function estimatePricePerPersonForRequest(params: {
  eventType: string;
  experienceTypeId?: string;
  experienceTypes: StoreExperienceTypeDTO[];
  menus?: StoreMenuDTO[];
  menuId?: string;
}): number | null {
  const { eventType, experienceTypeId, experienceTypes, menus, menuId } = params;

  if (menus && menuId?.trim() && experienceTypeId?.trim()) {
    const cents = getMenuExperiencePrice(menus, menuId, experienceTypeId);
    if (cents != null && cents > 0) {
      return cents / 100;
    }
    return null;
  }

  const row = experienceTypeId ? experienceTypes.find((t) => t.id === experienceTypeId) : undefined;
  if (row?.price_per_unit != null) {
    return Number(row.price_per_unit) / 100;
  }

  if (row?.slug) {
    const key = legacyPricingKeyFromSlug(row.slug);
    if (key) return PRICING_STRUCTURE[key];
  }

  if (isLegacyEventTypeKey(eventType)) {
    return PRICING_STRUCTURE[eventType];
  }

  return PRICING_STRUCTURE.plated_dinner;
}
