import { MedusaRequest, MedusaResponse } from '@medusajs/framework/http';
import { z } from 'zod';
import { SOCIAL_GALLERY_MODULE } from '../../../modules/social-gallery';
import type SocialGalleryModuleService from '../../../modules/social-gallery/service';
import {
  normalizeInstagramSource,
  scrapeSocialMetadata,
  titleFromInstagramSource,
} from '../../../lib/social-gallery/instagram';

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
    status: 'running',
    message: 'Import started.',
    raw_result: {
      source,
      provider_boundary: 'medusa_social_gallery_import',
    },
  } as any);

  if (source.kind === 'profile') {
    const social_import_job = await svc.updateSocialImportJobs({
      id: importJob.id,
      status: 'needs_connection',
      message: 'Instagram profile saved. Connect an Instagram importer to pull recent posts.',
      completed_at: new Date(),
      raw_result: {
        source,
        next_step: 'instagram_connector_required',
      },
    } as any);

    return res.status(202).json({
      social_import_job,
      social_account: account,
      social_gallery_posts: [],
    });
  }

  const metadata = await scrapeSocialMetadata(source.sourceUrl);
  const mediaUrl = metadata.video || metadata.image || '';

  if (!mediaUrl) {
    const social_import_job = await svc.updateSocialImportJobs({
      id: importJob.id,
      status: 'needs_connection',
      message: 'The post link was saved, but Instagram did not expose media publicly. Connect the Instagram importer to fetch it.',
      completed_at: new Date(),
      raw_result: {
        source,
        metadata,
        next_step: 'instagram_connector_required',
      },
    } as any);

    return res.status(202).json({
      social_import_job,
      social_account: account,
      social_gallery_posts: [],
    });
  }

  const social_gallery_post = await svc.createSocialGalleryPosts({
    title: metadata.title || titleFromInstagramSource(source),
    caption: metadata.caption || null,
    source_url: source.sourceUrl,
    instagram_handle: source.handle,
    provider: 'instagram',
    provider_media_id: source.shortcode,
    shortcode: source.shortcode,
    permalink: source.sourceUrl,
    import_status: 'draft',
    media_type: metadata.video ? 'video' : 'image',
    media_url: mediaUrl,
    thumbnail_url: !metadata.video ? metadata.image : null,
    poster_url: metadata.video ? metadata.image : null,
    alt_text: metadata.title || titleFromInstagramSource(source),
    category: parsed.data.category || 'dishes',
    display_style: 'normal',
    cta_label: parsed.data.cta_label || 'Book this experience',
    cta_url: parsed.data.cta_url || '/request',
    is_active: false,
    is_featured: false,
    sort_order: 0,
    raw_provider_data: {
      source,
      metadata,
    },
  } as any);

  const social_import_job = await svc.updateSocialImportJobs({
    id: importJob.id,
    status: 'completed',
    imported_count: 1,
    message: 'Imported one Instagram post as a draft.',
    completed_at: new Date(),
    raw_result: {
      source,
      metadata,
      draft_post_id: social_gallery_post.id,
    },
  } as any);

  res.status(201).json({
    social_import_job,
    social_account: account,
    social_gallery_posts: [social_gallery_post],
  });
}
