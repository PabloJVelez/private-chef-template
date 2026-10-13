import type { IFileModuleService, MedusaContainer } from '@medusajs/framework/types';
import { ContainerRegistrationKeys, Modules } from '@medusajs/framework/utils';
import { SOCIAL_GALLERY_MODULE } from '../../modules/social-gallery';
import type SocialGalleryModuleService from '../../modules/social-gallery/service';
import { apifyConfig, getApifyPosts, getApifyRun, startApifyRun } from './apify';
import { ImportError, storedAssets, type ImportedPost } from './contracts';
import { assetFileIds, persistMedia } from './media-storage';
import { claimImport, galleryDatabase, updateOwnedJob } from './job-store';

/** Existing content belongs to the chef. Re-import only repairs legacy remote media. */
export async function importDraft(
  svc: SocialGalleryModuleService,
  files: IFileModuleService,
  post: ImportedPost,
  signal: AbortSignal,
  budget: { bytes: number },
  verifyLease: () => Promise<void>,
  store = persistMedia,
): Promise<'created' | 'skipped' | 'repaired'> {
  const [existing] = await svc.listSocialGalleryPosts({ provider: 'instagram', provider_media_id: post.id });
  if (existing?.import_status === 'archived') return 'skipped';
  if (
    existing &&
    storedAssets(existing.media_assets).length &&
    storedAssets(existing.media_assets).every((asset) => asset.file_id)
  )
    return 'skipped';
  const assets = await store(files, post.assets, signal, budget);
  try {
    if (signal.aborted) throw new ImportError('timeout', 'Import timed out.', true);
    await verifyLease();
    const first = assets[0];
    const media = {
      media_assets: { items: assets },
      media_url: first.url,
      thumbnail_url: first.poster_url || (first.type === 'image' ? first.url : null),
      poster_url: first.poster_url || null,
      media_type: (assets.length > 1 ? 'carousel' : first.type) as 'image' | 'video' | 'carousel',
    };
    if (existing) {
      await svc.updateSocialGalleryPosts({ id: existing.id, ...media });
      return 'repaired';
    }
    const title = (post.caption.split('\n')[0].trim() || `From @${post.handle || 'the kitchen'}`).slice(0, 200);
    await svc.createSocialGalleryPosts({
      ...media,
      provider: 'instagram',
      provider_media_id: post.id,
      shortcode: post.shortcode,
      permalink: post.permalink,
      source_url: post.permalink,
      instagram_handle: post.handle,
      title,
      caption: post.caption || null,
      posted_at: post.posted_at ? new Date(post.posted_at) : null,
      alt_text: null,
      category: 'dishes',
      display_style: 'normal',
      cta_label: 'Book this experience',
      cta_url: '/request',
      import_status: 'draft',
      is_active: false,
      is_featured: false,
    });
    return 'created';
  } catch (error) {
    // A failed DB write must not leave the just-uploaded files behind.
    await files.deleteFiles(assetFileIds(assets)).catch(() => undefined);
    throw error;
  }
}

export async function processSocialGalleryImportJob(container: MedusaContainer, jobId: string) {
  const database = galleryDatabase(container);
  const job = await claimImport(database, jobId);
  if (!job) return;
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER);
  const svc = container.resolve<SocialGalleryModuleService>(SOCIAL_GALLERY_MODULE);
  const files = container.resolve<IFileModuleService>(Modules.FILE);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 8 * 60 * 1000);
  const patch = (values: Record<string, unknown>) => updateOwnedJob(database, job, values);
  const verifyLease = async () => {
    if (controller.signal.aborted)
      throw new ImportError('timeout', 'Import timed out. Retry resumes the saved run.', true);
    const result = await database.raw(
      'select id from social_import_job where id = ? and lease_token = ? and status = ? and lease_expires_at > now()',
      [job.id, job.lease_token, 'running'],
    );
    if (!result.rows.length)
      throw new ImportError('lease_lost', 'Import ownership changed. No further posts were saved.');
  };
  const priorIds = job.raw_result?.imported_provider_ids;
  const importedIds = new Set<string>(
    Array.isArray(priorIds) ? priorIds.filter((id): id is string => typeof id === 'string') : [],
  );
  const skippedIds = new Set<string>();
  let imported = importedIds.size;
  let skipped = 0;
  try {
    apifyConfig();
    if (!job.provider_run_id) {
      if (job.provider_starting)
        throw new ImportError('provider_start_uncertain', 'Check Apify Console before starting another import.');
      await patch({ provider_starting: true });
      job.provider_starting = true;
      const run = await startApifyRun(job.source_url, controller.signal);
      // Persist before polling or writing content. Do not retry start if this write fails.
      await patch({ provider_run_id: run.id, provider_starting: false });
      job.provider_run_id = run.id;
      job.provider_starting = false;
    }
    let run = await getApifyRun(job.provider_run_id, controller.signal);
    while (['READY', 'RUNNING', 'TIMING-OUT', 'ABORTING'].includes(run.status)) {
      await new Promise((resolve) => setTimeout(resolve, 3000));
      await verifyLease();
      run = await getApifyRun(job.provider_run_id, controller.signal);
    }
    if (!run.defaultDatasetId || !['SUCCEEDED', 'TIMED-OUT', 'ABORTED', 'FAILED'].includes(run.status)) {
      throw new ImportError(
        'provider_run_failed',
        'Apify did not return a usable dataset. Check the saved run in Apify Console.',
      );
    }
    await patch({ provider_dataset_id: run.defaultDatasetId });
    const result = await getApifyPosts(run.defaultDatasetId, controller.signal);
    const errors: string[] = [];
    if (result.rejected) errors.push(`${result.rejected} returned post(s) had incomplete or unsupported media.`);
    if (run.status !== 'SUCCEEDED') errors.push(`Apify run ended with ${run.status}; available results were retained.`);
    if (!result.posts.length) errors.push('No usable posts were returned. Check that the Instagram profile is public.');
    const budget = { bytes: 0 };
    let retryable = false;
    for (const post of result.posts) {
      await verifyLease();
      try {
        const outcome = await importDraft(svc, files, post, controller.signal, budget, verifyLease);
        if (outcome === 'skipped') {
          if (!importedIds.has(post.id)) skippedIds.add(post.id);
        } else importedIds.add(post.id);
        imported = importedIds.size;
        skipped = skippedIds.size;
        await patch({
          imported_count: imported,
          skipped_count: skipped,
          raw_result: { imported_provider_ids: [...importedIds] },
        });
      } catch (error) {
        if (controller.signal.aborted)
          throw new ImportError('timeout', 'Import timed out. Saved drafts were retained.', true);
        const failure =
          error instanceof ImportError
            ? error
            : new ImportError('media_storage', 'A post could not be saved. Check storage and retry.', true);
        if (failure.code === 'lease_lost') throw failure;
        errors.push(`${post.shortcode}: ${failure.message}`);
        retryable ||= failure.retryable;
      }
    }
    if (errors.length) throw new ImportError('partial_import', errors.slice(0, 4).join(' '), retryable);
    await patch({
      status: 'completed',
      message: `${imported} new/repaired draft(s); ${skipped} existing post(s) left unchanged.`,
      imported_count: imported,
      skipped_count: skipped,
      completed_at: new Date(),
      failure_code: null,
    });
    if (job.account_id)
      await svc
        .updateSocialAccounts({ id: job.account_id, status: 'active', last_synced_at: new Date(), last_error: null })
        .catch(() => logger.warn(`[social-gallery] account status could not be updated for ${job.id}`));
  } catch (error) {
    if (error instanceof ImportError && error.code === 'provider_rejected') job.provider_starting = false;
    const failure =
      job.provider_starting && !job.provider_run_id
        ? new ImportError(
            'provider_start_uncertain',
            'Apify run start is uncertain. Check Apify Console before starting another import to avoid duplicate charges.',
          )
        : error instanceof ImportError
          ? error
          : new ImportError(
              'import_failed',
              'Import could not complete. Saved drafts were retained; check server storage/configuration.',
            );
    const retry = failure.retryable && !!job.provider_run_id && job.attempt_count < 3;
    await patch({
      status: retry ? 'queued' : 'failed',
      failure_code: failure.code,
      provider_starting: job.provider_starting,
      message: `${imported} new/repaired post(s) retained. ${failure.message}${retry ? ' Retrying the saved run shortly.' : ''}`,
      error_message: failure.message,
      imported_count: imported,
      skipped_count: skipped,
      next_attempt_at: retry ? new Date(Date.now() + job.attempt_count * 60000) : null,
      completed_at: retry ? null : new Date(),
    }).catch(() => logger.warn(`[social-gallery] job ${job.id} could not be updated; reconciliation will recover it.`));
    logger.warn(`[social-gallery] job ${job.id}: ${failure.code}`);
  } finally {
    clearTimeout(timer);
  }
}
