/**
 * @deprecated Legacy fallback only — pricing is now driven by menu × experience type.
 * Kept for backward compatibility with events created before the pricing refactor.
 */
export const LEGACY_FALLBACK_PRICE_PER_PERSON = {
  buffet_style: 99.99,
  cooking_class: 119.99,
  plated_dinner: 149.99,
  meal_prep: 89.99,
} as const;

export type LegacyEventTypeKey = keyof typeof LEGACY_FALLBACK_PRICE_PER_PERSON;

export function isLegacyEventTypeKey(value: string): value is LegacyEventTypeKey {
  return (
    value === 'buffet_style' ||
    value === 'cooking_class' ||
    value === 'plated_dinner' ||
    value === 'meal_prep'
  );
}

/**
 * @deprecated Use menu × experience pricing. This is a legacy fallback only.
 * Resolve fallback $/person from stored event label, legacy slug, or default.
 */
export function fallbackPricePerPersonFromStrings(eventType: string, experienceSlug?: string | null): number {
  if (isLegacyEventTypeKey(eventType)) {
    return LEGACY_FALLBACK_PRICE_PER_PERSON[eventType];
  }
  if (experienceSlug) {
    const normalized = experienceSlug.replace(/-/g, '_');
    if (isLegacyEventTypeKey(normalized)) {
      return LEGACY_FALLBACK_PRICE_PER_PERSON[normalized];
    }
  }
  return LEGACY_FALLBACK_PRICE_PER_PERSON.plated_dinner;
}

const DEFAULT_DURATIONS_MINUTES: Record<LegacyEventTypeKey, number> = {
  cooking_class: 180,
  plated_dinner: 240,
  buffet_style: 150,
  meal_prep: 120,
};

export function defaultEstimatedDurationMinutes(eventType: string, experienceSlug?: string | null): number {
  if (isLegacyEventTypeKey(eventType)) return DEFAULT_DURATIONS_MINUTES[eventType];
  if (experienceSlug) {
    const normalized = experienceSlug.replace(/-/g, '_');
    if (isLegacyEventTypeKey(normalized)) {
      return DEFAULT_DURATIONS_MINUTES[normalized];
    }
  }
  return DEFAULT_DURATIONS_MINUTES.plated_dinner;
}
