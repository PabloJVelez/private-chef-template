import { MedusaRequest, MedusaResponse } from '@medusajs/framework/http';
import { z } from 'zod';
import { EXPERIENCE_TYPE_MODULE } from '../../../modules/experience-type';
import type ExperienceTypeModuleService from '../../../modules/experience-type/service';

const createSchema = z.object({
  name: z.string().min(1),
  slug: z.string().optional(),
  description: z.string().default(''),
  short_description: z.string().optional().nullable(),
  icon: z.string().optional().nullable(),
  image_url: z.string().optional().nullable(),
  highlights: z.array(z.string()).optional(),
  ideal_for: z.string().optional().nullable(),
  pricing_type: z.enum(['per_person', 'per_item', 'product_based']).optional(),
  price_per_unit: z.number().optional().nullable(),
  duration_minutes: z.number().optional().nullable(),
  duration_display: z.string().optional().nullable(),
  is_product_based: z.boolean().optional(),
  location_type: z.enum(['customer', 'fixed']).optional(),
  fixed_location_address: z.string().optional().nullable(),
  requires_advance_notice: z.boolean().optional(),
  advance_notice_days: z.number().optional(),
  available_time_slots: z.array(z.string()).optional(),
  time_slot_start: z.string().optional().nullable(),
  time_slot_end: z.string().optional().nullable(),
  time_slot_interval_minutes: z.number().optional(),
  min_party_size: z.number().optional(),
  max_party_size: z.number().optional().nullable(),
  is_active: z.boolean().optional(),
  is_featured: z.boolean().optional(),
  sort_order: z.number().optional(),
});

const slugify = (val: string) =>
  val
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');

export async function GET(req: MedusaRequest, res: MedusaResponse) {
  const svc = req.scope.resolve(EXPERIENCE_TYPE_MODULE) as ExperienceTypeModuleService;

  const experienceTypes = await svc.listExperienceTypes(
    {},
    { order: { sort_order: 'ASC' } },
  );

  res.status(200).json({ experience_types: experienceTypes });
}

export async function POST(req: MedusaRequest, res: MedusaResponse) {
  const svc = req.scope.resolve(EXPERIENCE_TYPE_MODULE) as ExperienceTypeModuleService;
  const parsed = createSchema.safeParse(req.body);

  if (!parsed.success) {
    return res.status(400).json({ message: 'Validation error', errors: parsed.error.issues });
  }

  const data = parsed.data;

  const experienceType = await svc.createExperienceTypes({
    ...(data as any),
    slug: data.slug || slugify(data.name),
    highlights: data.highlights ?? [],
    available_time_slots: data.available_time_slots ?? [],
  } as any);

  res.status(201).json({ experience_type: experienceType });
}
