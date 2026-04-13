import type ExperienceTypeModuleService from '../../modules/experience-type/service';

interface ExperienceTypeSeedRow {
  name: string;
  slug: string;
  description: string;
  short_description: string;
  icon: string;
  image_url: string;
  highlights: string[];
  ideal_for: string;
  pricing_type: 'per_person' | 'per_item' | 'product_based';
  price_per_unit: number | null;
  duration_minutes: number;
  duration_display: string;
  workflow_event_type: 'cooking_class' | 'plated_dinner' | 'buffet_style';
  is_active: boolean;
  is_featured: boolean;
  sort_order: number;
  min_party_size: number;
  max_party_size: number | null;
}

const defaultExperienceTypes: ExperienceTypeSeedRow[] = [
  {
    name: 'Buffet Style',
    slug: 'buffet-style',
    description:
      'Perfect for larger gatherings and casual entertaining. A variety of dishes served buffet-style, allowing guests to mingle and enjoy at their own pace.',
    short_description: 'Casual entertaining with variety',
    icon: '🥘',
    image_url: '/assets/images/buffet.jpg',
    highlights: [
      'Multiple dishes and appetizers',
      'Self-service dining style',
      'Great for mingling',
      'Flexible timing',
    ],
    ideal_for: 'Birthday parties, family gatherings, casual celebrations',
    pricing_type: 'per_person',
    price_per_unit: null,
    duration_minutes: 150,
    duration_display: '~2.5 hours',
    workflow_event_type: 'buffet_style',
    is_active: true,
    is_featured: false,
    sort_order: 0,
    min_party_size: 2,
    max_party_size: 50,
  },
  {
    name: 'Cooking Class',
    slug: 'cooking-class',
    description:
      'An interactive culinary experience where you learn professional techniques while preparing a delicious meal together.',
    short_description: 'Interactive hands-on cooking',
    icon: '👨‍🍳',
    image_url: '/assets/images/cooking_class.jpg',
    highlights: [
      'Hands-on cooking instruction',
      'Learn professional techniques',
      'Interactive experience',
      'Take home new skills',
    ],
    ideal_for: 'Date nights, team building, skill development',
    pricing_type: 'per_person',
    price_per_unit: null,
    duration_minutes: 180,
    duration_display: '~3 hours',
    workflow_event_type: 'cooking_class',
    is_active: true,
    is_featured: true,
    sort_order: 1,
    min_party_size: 2,
    max_party_size: 20,
  },
  {
    name: 'Plated Dinner',
    slug: 'plated-dinner',
    description:
      'An elegant, restaurant-quality dining experience with multiple courses served individually. Perfect for special occasions.',
    short_description: 'Elegant multi-course dining',
    icon: '🍽️',
    image_url: '/assets/images/plated_dinner.jpg',
    highlights: [
      'Multi-course tasting menu',
      'Restaurant-quality presentation',
      'Full-service dining',
      'Premium ingredients',
    ],
    ideal_for: 'Anniversaries, proposals, formal celebrations',
    pricing_type: 'per_person',
    price_per_unit: null,
    duration_minutes: 240,
    duration_display: '~4 hours',
    workflow_event_type: 'plated_dinner',
    is_active: true,
    is_featured: false,
    sort_order: 2,
    min_party_size: 2,
    max_party_size: 16,
  },
];

export async function seedExperienceTypes(
  svc: ExperienceTypeModuleService,
): Promise<void> {
  const existing = await svc.listExperienceTypes({});
  if (existing.length > 0) return;

  for (const row of defaultExperienceTypes) {
    await svc.createExperienceTypes(row as any);
  }
}
