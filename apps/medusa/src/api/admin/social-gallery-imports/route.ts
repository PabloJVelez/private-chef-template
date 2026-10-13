import { MedusaRequest, MedusaResponse } from '@medusajs/framework/http';
import { Modules } from '@medusajs/framework/utils';
import { z } from 'zod';
import { SOCIAL_GALLERY_MODULE } from '../../../modules/social-gallery';
import type SocialGalleryModuleService from '../../../modules/social-gallery/service';
import { normalizeInstagramSource } from '../../../lib/social-gallery/instagram';
import { apifyConfig } from '../../../lib/social-gallery/apify';
import { listQuery } from '../../../lib/social-gallery/contracts';

type EventBus = { emit: (event: { name: string; data: { jobId: string } }) => Promise<unknown> };

export async function GET(req: MedusaRequest, res: MedusaResponse) {
  const svc = req.scope.resolve<SocialGalleryModuleService>(SOCIAL_GALLERY_MODULE);
  const query = listQuery.safeParse(req.query);
  if (!query.success) return res.status(400).json({ message: 'Invalid pagination.' });
  const [jobs, count] = await svc.listAndCountSocialImportJobs(
    {},
    { order: { created_at: 'DESC' }, take: query.data.limit, skip: query.data.offset },
  );
  const [accounts, accountCount] = await svc.listAndCountSocialAccounts({}, { take: 100 });
  let configured = false;
  try {
    apifyConfig();
    configured = true;
  } catch {
    /* Expose state, never token/config values. */
  }
  return res.json({
    social_import_jobs: jobs.map(({ raw_result, lease_token, ...job }) => job),
    social_accounts: accounts,
    count,
    account_count: accountCount,
    configured,
  });
}

export async function POST(req: MedusaRequest, res: MedusaResponse) {
  const input = z.object({ source: z.string().trim().min(1).max(2048) }).safeParse(req.body);
  if (!input.success) return res.status(400).json({ message: 'Enter an Instagram profile or post link.' });
  let source;
  try {
    source = normalizeInstagramSource(input.data.source);
  } catch {
    return res.status(400).json({ message: 'Enter a valid Instagram profile or post link.' });
  }
  try {
    apifyConfig();
  } catch {
    return res
      .status(503)
      .json({ message: 'Instagram import is not configured. Connect Apify in the server settings first.' });
  }
  const svc = req.scope.resolve<SocialGalleryModuleService>(SOCIAL_GALLERY_MODULE);
  const active = await svc.listSocialImportJobs(
    { source_url: source.sourceUrl, status: ['queued', 'running'] },
    { take: 1 },
  );
  if (active[0]) return res.status(202).json({ social_import_job: active[0], social_gallery_posts: [] });
  let account = null;
  if (source.handle) {
    [account] = await svc.listSocialAccounts({ provider: 'instagram', handle: source.handle });
    if (!account) {
      try {
        account = await svc.createSocialAccounts({
          provider: 'instagram',
          handle: source.handle,
          profile_url: source.sourceUrl,
          status: 'connected',
        });
      } catch (error) {
        [account] = await svc.listSocialAccounts({ provider: 'instagram', handle: source.handle });
        if (!account) throw error;
      }
    }
  }
  let job;
  try {
    job = await svc.createSocialImportJobs({
      provider: 'instagram',
      source_url: source.sourceUrl,
      handle: source.handle,
      account_id: account?.id || null,
      status: 'queued',
      message: 'Instagram import queued.',
    });
  } catch (error) {
    const [existing] = await svc.listSocialImportJobs(
      { source_url: source.sourceUrl, status: ['queued', 'running'] },
      { take: 1 },
    );
    if (!existing) throw error;
    job = existing;
  }
  // The scheduled reconciler also picks queued jobs if Redis emission fails.
  await req.scope
    .resolve<EventBus>(Modules.EVENT_BUS)
    .emit({ name: 'social-gallery.import-requested', data: { jobId: job.id } })
    .catch(() => undefined);
  return res.status(202).json({ social_import_job: job, social_account: account, social_gallery_posts: [] });
}
