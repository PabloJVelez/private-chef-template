import { z } from 'zod';
import type { AdminExperienceTypeDTO } from '../../../sdk/admin/admin-experience-types';

const numberOrUndefined = z.preprocess((val) => {
  if (val === '' || val === null || typeof val === 'undefined') return undefined;
  if (typeof val === 'number' && Number.isNaN(val)) return undefined;
  const num = typeof val === 'number' ? val : Number(val);
  return Number.isNaN(num) ? undefined : num;
}, z.number().optional());

const numberOrNull = z.preprocess((val) => {
  if (val === '' || typeof val === 'undefined' || val === null) return null;
  if (typeof val === 'number' && Number.isNaN(val)) return null;
  const num = typeof val === 'number' ? val : Number(val);
  return Number.isNaN(num) ? null : num;
}, z.number().nullable());

export const experienceTypeSchema = z.object({
  name: z.string().min(1, 'Name is required'),
  slug: z.string().optional(),
  description: z.string().optional(),
  short_description: z.string().optional().nullable(),
  icon: z.string().optional().nullable(),
  image_url: z.string().optional().nullable(),
  ideal_for: z.string().optional().nullable(),
  price_dollars: numberOrNull.optional(),
  duration_hours: numberOrNull.optional(),
  duration_display: z.string().optional().nullable(),
  pricing_type: z.enum(['per_person', 'per_item', 'product_based']).default('per_person'),
  location_type: z.enum(['customer', 'fixed']).default('customer'),
  fixed_location_address: z.string().optional().nullable(),
  requires_advance_notice: z.boolean().default(true),
  advance_notice_days: numberOrUndefined.optional(),
  available_time_slots_input: z.string().optional().default(''),
  time_slot_start_display: z.string().optional().default(''),
  time_slot_end_display: z.string().optional().default(''),
  time_slot_interval_minutes: numberOrUndefined.optional(),
  min_party_size: numberOrUndefined.optional(),
  max_party_size: numberOrNull.optional(),
  is_active: z.boolean().default(true),
  is_featured: z.boolean().default(false),
  sort_order: numberOrUndefined.optional(),
  highlights_input: z.string().optional().default(''),
});

export type ExperienceTypeFormValues = z.infer<typeof experienceTypeSchema>;

const joinCsv = (arr?: string[] | null) => (arr && arr.length ? arr.join(', ') : '');

function centsToDollars(cents: number | null | undefined): number | null {
  if (cents == null) return null;
  return Number((cents / 100).toFixed(2));
}

function minutesToHours(minutes: number | null | undefined): number | null {
  if (minutes == null) return null;
  return Number((minutes / 60).toFixed(2));
}

function to12Hour(time24: string | null | undefined): string {
  if (!time24) return '';
  const [h, m] = time24.split(':').map(Number);
  if (isNaN(h) || isNaN(m)) return time24;
  const period = h >= 12 ? 'PM' : 'AM';
  const hour12 = h === 0 ? 12 : h > 12 ? h - 12 : h;
  return `${hour12}:${m.toString().padStart(2, '0')} ${period}`;
}

export function to24Hour(time12: string): string | null {
  if (!time12.trim()) return null;
  const match = time12.trim().match(/^(\d{1,2}):(\d{2})\s*(AM|PM)$/i);
  if (!match) return time12;
  let h = parseInt(match[1], 10);
  const min = match[2];
  const period = match[3].toUpperCase();
  if (period === 'PM' && h < 12) h += 12;
  if (period === 'AM' && h === 12) h = 0;
  return `${h.toString().padStart(2, '0')}:${min}`;
}

export const getDefaultExperienceTypeValues = (experienceType?: AdminExperienceTypeDTO): ExperienceTypeFormValues => {
  if (!experienceType) {
    return {
      name: '',
      slug: '',
      description: '',
      short_description: '',
      icon: '',
      image_url: '',
      ideal_for: '',
      pricing_type: 'per_person',
      price_dollars: null,
      duration_hours: null,
      duration_display: '',
      location_type: 'customer',
      fixed_location_address: '',
      requires_advance_notice: true,
      advance_notice_days: 7,
      available_time_slots_input: '',
      time_slot_start_display: '9:00 AM',
      time_slot_end_display: '5:00 PM',
      time_slot_interval_minutes: 30,
      min_party_size: 1,
      max_party_size: null,
      is_active: true,
      is_featured: false,
      sort_order: 0,
      highlights_input: '',
    };
  }

  return {
    name: experienceType.name,
    slug: experienceType.slug,
    description: experienceType.description ?? '',
    short_description: experienceType.short_description ?? '',
    icon: experienceType.icon ?? '',
    image_url: experienceType.image_url ?? '',
    ideal_for: experienceType.ideal_for ?? '',
    pricing_type: experienceType.pricing_type ?? 'per_person',
    price_dollars: centsToDollars(experienceType.price_per_unit),
    duration_hours: minutesToHours(experienceType.duration_minutes),
    duration_display: experienceType.duration_display ?? '',
    location_type: experienceType.location_type,
    fixed_location_address: experienceType.fixed_location_address ?? '',
    requires_advance_notice: experienceType.requires_advance_notice,
    advance_notice_days: experienceType.advance_notice_days,
    available_time_slots_input: joinCsv(experienceType.available_time_slots ?? []),
    time_slot_start_display: to12Hour(experienceType.time_slot_start),
    time_slot_end_display: to12Hour(experienceType.time_slot_end),
    time_slot_interval_minutes: experienceType.time_slot_interval_minutes,
    min_party_size: experienceType.min_party_size,
    max_party_size: experienceType.max_party_size ?? null,
    is_active: experienceType.is_active,
    is_featured: experienceType.is_featured,
    sort_order: experienceType.sort_order,
    highlights_input: joinCsv(experienceType.highlights ?? []),
  };
};
