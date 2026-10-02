import { MedusaRequest, MedusaResponse } from '@medusajs/framework/http';
import { Modules } from '@medusajs/framework/utils';
import { z } from 'zod';
import { SOCIAL_GALLERY_MODULE } from '../../../modules/social-gallery';
import type SocialGalleryModuleService from '../../../modules/social-gallery/service';
import { normalizeInstagramSource } from '../../../lib/social-gallery/instagram';

type EventBusService = {
  emit: (message: { name: string; data: Record<string, unknown> }) => Promise<void>;
};

const createImportSchema = z.object({
  source: z.string().min(1),
  category: z.enum(['dishes', 'private_dinners', 'events', 'behind_the_scenes', 'press_collabs']).optional(),
  cta_label: z.string().optional().nullable(),
  cta_url: z.string().optional().nullable(),
});

const getOrCreateAccount = async (
  svc: SocialGalleryModuleService,
  source: ReturnType<typeof normalizeInstagramSource>,
) => {
  if (!source.handle) return null;

  const [existing] = await svc.listSocialAccounts({
    provider: 'instagram',
    handle: source.handle,
  } as any);

  if (existing) {
    return existing;
  }

  return svc.createSocialAccounts({
    provider: 'instagram',
    handle: source.handle,
    profile_url: `https://www.instagram.com/${source.handle}/`,
    status: 'needs_connection',
    metadata: {
      import_strategy: 'medusa_import_job',
    },
  } as any);
};

export async function GET(req: MedusaRequest, res: MedusaResponse) {
  const svc = req.scope.resolve(SOCIAL_GALLERY_MODULE) as SocialGalleryModuleService;

  const social_import_jobs = await svc.listSocialImportJobs(
    {},
    {
      order: {
        created_at: 'DESC',
      },
      take: Number(req.query.limit || 20),
    },
  );

  const social_accounts = await svc.listSocialAccounts(
    {},
    {
      order: {
        created_at: 'DESC',
      },
    },
  );

  res.status(200).json({ social_import_jobs, social_accounts });
}

export async function POST(req: MedusaRequest, res: MedusaResponse) {
  const svc = req.scope.resolve(SOCIAL_GALLERY_MODULE) as SocialGalleryModuleService;
  const eventBus = req.scope.resolve(Modules.EVENT_BUS) as EventBusService;
  const parsed = createImportSchema.safeParse(req.body);

  if (!parsed.success) {
    return res.status(400).json({ message: 'Validation error', errors: parsed.error.issues });
  }

  let source: ReturnType<typeof normalizeInstagramSource>;
  try {
    source = normalizeInstagramSource(parsed.data.source);
  } catch (error) {
    return res.status(400).json({
      message: error instanceof Error ? error.message : 'Invalid Instagram source.',
    });
  }

  const account = await getOrCreateAccount(svc, source);
  const importJob = await svc.createSocialImportJobs({
    provider: 'instagram',
    account_id: account?.id ?? null,
    source_url: source.sourceUrl,
    handle: source.handle,
    status: 'queued',
    message: 'Instagram import queued.',
    raw_result: {
      source,
      request: {
        category: parsed.data.category || 'dishes',
        cta_label: parsed.data.cta_label || 'Book this experience',
        cta_url: parsed.data.cta_url || '/request',
      },
      provider_boundary: 'medusa_social_gallery_import',
    },
  } as any);

  await eventBus.emit({
    name: 'social-gallery.import-requested',
    data: {
      jobId: importJob.id,
    },
  });

  res.status(202).json({
    social_import_job: importJob,
    social_account: account,
    social_gallery_posts: [],
  });
}
