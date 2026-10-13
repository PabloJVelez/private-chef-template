import { randomUUID } from 'node:crypto';
import type { MedusaContainer } from '@medusajs/framework/types';
import { ContainerRegistrationKeys } from '@medusajs/framework/utils';

export interface ImportJob {
  id: string;
  source_url: string;
  handle: string | null;
  account_id: string | null;
  status: string;
  attempt_count: number;
  lease_token: string;
  provider_run_id: string | null;
  provider_starting: boolean;
  provider_dataset_id: string | null;
  raw_result: Record<string, any> | null;
  imported_count: number;
  skipped_count: number;
}
export interface GalleryDatabase {
  raw<T = any>(sql: string, bindings?: unknown[]): Promise<{ rows: T[] }>;
  transaction<T>(callback: (database: GalleryDatabase) => Promise<T>): Promise<T>;
}
export const galleryDatabase = (container: MedusaContainer) =>
  container.resolve<GalleryDatabase>(ContainerRegistrationKeys.PG_CONNECTION);

/** One import at a time per database: bounded memory and no concurrent writes to the same source. */
export async function claimImport(database: GalleryDatabase, id: string): Promise<ImportJob | null> {
  return database.transaction(async (trx) => {
    await trx.raw('select pg_advisory_xact_lock(72419301)');
    const busy = await trx.raw(
      "select id from social_import_job where status = 'running' and deleted_at is null limit 1",
    );
    if (busy.rows.length) return null;
    const result = await trx.raw<ImportJob>(
      `update social_import_job set status = 'running', lease_token = ?, lease_expires_at = now() + interval '12 minutes', attempt_count = attempt_count + 1, updated_at = now(), message = 'Importing Instagram posts.', error_message = null where id = ? and status = 'queued' and attempt_count < 3 and (next_attempt_at is null or next_attempt_at <= now()) and deleted_at is null returning *`,
      [randomUUID(), id],
    );
    return result.rows[0] || null;
  });
}

export async function updateOwnedJob(database: GalleryDatabase, job: ImportJob, values: Record<string, unknown>) {
  const allowed = new Set([
    'status',
    'provider_starting',
    'provider_run_id',
    'provider_dataset_id',
    'message',
    'error_message',
    'failure_code',
    'imported_count',
    'skipped_count',
    'completed_at',
    'next_attempt_at',
    'raw_result',
  ]);
  const entries = Object.entries(values);
  if (!entries.length || entries.some(([key]) => !allowed.has(key))) throw new Error('Invalid job update.');
  const result = await database.raw(
    `update social_import_job set ${entries.map(([key]) => `${key} = ?`).join(', ')}, updated_at = now() where id = ? and lease_token = ? and status = 'running' returning id`,
    [...entries.map(([key, value]) => (key === 'raw_result' ? JSON.stringify(value) : value)), job.id, job.lease_token],
  );
  if (!result.rows.length) throw new Error('Import lease was lost.');
}

export async function recoverImports(database: GalleryDatabase) {
  // A start request without a saved run ID must NEVER be automatically replayed.
  await database.raw(`update social_import_job set status = case when provider_starting and provider_run_id is null then 'failed' when attempt_count >= 3 then 'failed' else 'queued' end,
    failure_code = case when provider_starting and provider_run_id is null then 'provider_start_uncertain' else 'interrupted' end,
    message = case when provider_starting and provider_run_id is null then 'Check Apify Console before starting another import; the previous run start is uncertain.' else 'Import interrupted. Retry resumes its saved Apify run.' end,
    lease_token = null, next_attempt_at = now(), updated_at = now()
    where status = 'running' and deleted_at is null and (lease_expires_at < now() or lease_expires_at is null)`);
  return (
    await database.raw<{ id: string }>(
      "select id from social_import_job where status = 'queued' and deleted_at is null and attempt_count < 3 and (next_attempt_at is null or next_attempt_at <= now()) order by created_at asc limit 1",
    )
  ).rows;
}
