import { Migration } from '@mikro-orm/migrations';

export class Migration20261013010000 extends Migration {
  override async up(): Promise<void> {
    this.addSql('alter table "social_gallery_post" add column if not exists "media_assets" jsonb null;');
    this.addSql(`alter table "social_import_job"
      add column if not exists "provider_run_id" text null,
      add column if not exists "provider_dataset_id" text null,
      add column if not exists "provider_starting" boolean not null default false,
      add column if not exists "attempt_count" integer not null default 0,
      add column if not exists "skipped_count" integer not null default 0,
      add column if not exists "lease_token" text null,
      add column if not exists "lease_expires_at" timestamptz null,
      add column if not exists "next_attempt_at" timestamptz null,
      add column if not exists "failure_code" text null;`);
    // Old Python jobs must not unexpectedly launch paid runs after migration.
    this.addSql(
      `update "social_import_job" set status = 'failed', message = 'Legacy import stopped during the Apify upgrade. Start a new import after setup.', failure_code = 'legacy_import' where status in ('queued', 'running');`,
    );
    this.addSql(
      `create unique index if not exists "IDX_gallery_active_source" on "social_import_job" ("source_url") where deleted_at is null and status in ('queued', 'running');`,
    );
  }
  override async down(): Promise<void> {
    this.addSql('drop index if exists "IDX_gallery_active_source";');
    this.addSql('alter table "social_gallery_post" drop column if exists "media_assets";');
    for (const column of [
      'provider_run_id',
      'provider_dataset_id',
      'provider_starting',
      'attempt_count',
      'skipped_count',
      'lease_token',
      'lease_expires_at',
      'next_attempt_at',
      'failure_code',
    ]) {
      this.addSql(`alter table "social_import_job" drop column if exists "${column}";`);
    }
  }
}
