import { MedusaRequest, MedusaResponse } from '@medusajs/framework/http';
import { Modules } from '@medusajs/framework/utils';
import { galleryDatabase } from '../../../../../lib/social-gallery/job-store';
import { apifyConfig } from '../../../../../lib/social-gallery/apify';

export async function POST(req: MedusaRequest, res: MedusaResponse) {
  try {
    apifyConfig();
  } catch {
    return res.status(503).json({ message: 'Connect Apify first.' });
  }
  const db = galleryDatabase(req.scope);
  const result = await db.transaction(async (trx) => {
    await trx.raw('select pg_advisory_xact_lock(72419301)');
    return trx.raw(
      `update social_import_job j set status = 'queued', attempt_count = 0, next_attempt_at = now(), completed_at = null, message = 'Retry queued; reusing saved Apify run.'
      where j.id = ? and j.status = 'failed' and j.deleted_at is null and j.provider_run_id is not null
      and j.failure_code is distinct from 'provider_start_uncertain'
      and not exists (select 1 from social_import_job other where other.source_url = j.source_url and other.status in ('queued', 'running') and other.deleted_at is null)
      returning j.id`,
      [req.params.id],
    );
  });
  if (!result.rows.length)
    return res
      .status(409)
      .json({
        message:
          'This import cannot be resumed, or another import is already active. Check Apify Console before starting a new import.',
      });
  await req.scope
    .resolve<{ emit: (input: unknown) => Promise<unknown> }>(Modules.EVENT_BUS)
    .emit({ name: 'social-gallery.import-requested', data: { jobId: req.params.id } })
    .catch(() => undefined);
  return res.status(202).json({ id: req.params.id, status: 'queued' });
}
