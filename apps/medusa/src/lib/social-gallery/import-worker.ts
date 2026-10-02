import { spawn } from 'node:child_process';
import path from 'node:path';
import { ContainerRegistrationKeys } from '@medusajs/framework/utils';
import { SOCIAL_GALLERY_MODULE } from '../../modules/social-gallery';
import type SocialGalleryModuleService from '../../modules/social-gallery/service';

type ImportWorkerInput = {
  job_id: string;
  source_url: string;
  handle?: string | null;
  account_id?: string | null;
  options?: {
    category?: string;
    cta_label?: string | null;
    cta_url?: string | null;
  };
};

type ImportWorkerMedia = {
  provider_media_id?: string | null;
  shortcode?: string | null;
  permalink: string;
  title: string;
  caption?: string | null;
  media_type: 'image' | 'video' | 'carousel';
  media_url: string;
  thumbnail_url?: string | null;
  poster_url?: string | null;
  posted_at?: string | null;
  raw_provider_data?: Record<string, unknown> | null;
};

type ImportWorkerOutput = {
  status: 'completed' | 'needs_connection' | 'failed';
  message?: string | null;
  account?: {
    status?: 'needs_connection' | 'connected' | 'import_limited' | 'active' | 'error';
    metadata?: Record<string, unknown> | null;
  } | null;
  media?: ImportWorkerMedia[];
  raw_result?: Record<string, unknown> | null;
};

type Logger = {
  info: (msg: string) => void;
  warn: (msg: string) => void;
  error: (msg: string) => void;
};

const workerCommand = () => {
  const configured = process.env.SOCIAL_GALLERY_INSTAGRAM_WORKER_COMMAND;
  if (configured) {
    const [command, ...args] = configured.split(' ').filter(Boolean);
    return { command, args };
  }

  return {
    command: process.env.PYTHON || 'python3',
    args: [path.join(process.cwd(), 'src/scripts/social-gallery-instagram-worker.py')],
  };
};

const runWorker = (input: ImportWorkerInput): Promise<ImportWorkerOutput> =>
  new Promise((resolve, reject) => {
    const { command, args } = workerCommand();
    const child = spawn(command, args, {
      cwd: process.cwd(),
      env: process.env,
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    let stdout = '';
    let stderr = '';

    child.stdout.setEncoding('utf8');
    child.stderr.setEncoding('utf8');
    child.stdout.on('data', (chunk) => {
      stdout += chunk;
    });
    child.stderr.on('data', (chunk) => {
      stderr += chunk;
    });

    child.on('error', reject);
    child.on('close', (code) => {
      if (code !== 0) {
        reject(new Error(stderr || `Instagram import worker exited with code ${code}`));
        return;
      }

      try {
        resolve(JSON.parse(stdout) as ImportWorkerOutput);
      } catch (error) {
        reject(new Error(`Instagram import worker returned invalid JSON: ${error instanceof Error ? error.message : String(error)}`));
      }
    });

    child.stdin.write(JSON.stringify(input));
    child.stdin.end();
  });

const upsertDraftPost = async (
  svc: SocialGalleryModuleService,
  media: ImportWorkerMedia,
  input: ImportWorkerInput,
) => {
  const category = input.options?.category || 'dishes';
  const ctaLabel = input.options?.cta_label || 'Book this experience';
  const ctaUrl = input.options?.cta_url || '/request';
  const providerMediaId = media.provider_media_id || media.shortcode || media.permalink;

  const [existing] = await svc.listSocialGalleryPosts({
    provider: 'instagram',
    provider_media_id: providerMediaId,
  } as any);

  const payload = {
    title: media.title,
    caption: media.caption || null,
    source_url: media.permalink,
    instagram_handle: input.handle || null,
    provider: 'instagram',
    provider_media_id: providerMediaId,
    shortcode: media.shortcode || null,
    permalink: media.permalink,
    import_status: 'draft',
    media_type: media.media_type,
    media_url: media.media_url,
    thumbnail_url: media.thumbnail_url || null,
    poster_url: media.poster_url || null,
    alt_text: media.title,
    posted_at: media.posted_at ? new Date(media.posted_at) : null,
    category,
    display_style: 'normal',
    cta_label: ctaLabel,
    cta_url: ctaUrl,
    is_active: false,
    is_featured: false,
    raw_provider_data: media.raw_provider_data || null,
  } as any;

  if (existing?.id) {
    return svc.updateSocialGalleryPosts({
      id: existing.id,
      ...payload,
    });
  }

  return svc.createSocialGalleryPosts(payload);
};

export const processSocialGalleryImportJob = async (container: any, jobId: string) => {
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER) as Logger;
  const svc = container.resolve(SOCIAL_GALLERY_MODULE) as SocialGalleryModuleService;

  const job = await svc.retrieveSocialImportJob(jobId);
  if (!job?.id) {
    logger.warn(`[social-gallery-import] job not found: ${jobId}`);
    return;
  }

  if (job.status === 'running') {
    logger.info(`[social-gallery-import] job already running: ${jobId}`);
    return;
  }

  await svc.updateSocialImportJobs({
    id: job.id,
    status: 'running',
    message: 'Instagram import worker started.',
    error_message: null,
  } as any);

  const input: ImportWorkerInput = {
    job_id: job.id,
    source_url: job.source_url,
    handle: job.handle,
    account_id: job.account_id,
    options: ((job.raw_result as any)?.request || {}) as ImportWorkerInput['options'],
  };

  try {
    const result = await runWorker(input);
    const importedPosts = [];

    for (const media of result.media || []) {
      if (!media.media_url) continue;
      importedPosts.push(await upsertDraftPost(svc, media, input));
    }

    if (job.account_id && result.account?.status) {
      await svc.updateSocialAccounts({
        id: job.account_id,
        status: result.account.status,
        last_synced_at: result.status === 'completed' ? new Date() : null,
        last_error: result.status === 'failed' ? result.message || 'Instagram import failed.' : null,
        metadata: result.account.metadata || null,
      } as any);
    }

    await svc.updateSocialImportJobs({
      id: job.id,
      status: result.status,
      imported_count: importedPosts.length,
      message: result.message || (importedPosts.length ? `Imported ${importedPosts.length} Instagram draft(s).` : 'Instagram import finished.'),
      error_message: result.status === 'failed' ? result.message || 'Instagram import failed.' : null,
      raw_result: {
        ...(job.raw_result as Record<string, unknown> | null),
        worker: result.raw_result || result,
        imported_post_ids: importedPosts.map((post: any) => post.id),
      },
      completed_at: new Date(),
    } as any);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logger.error(`[social-gallery-import] job ${job.id} failed: ${message}`);
    await svc.updateSocialImportJobs({
      id: job.id,
      status: 'failed',
      message: 'Instagram import failed.',
      error_message: message,
      completed_at: new Date(),
    } as any);
  }
};
