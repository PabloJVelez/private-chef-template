import { Migration } from '@mikro-orm/migrations';

export class Migration20261002043000 extends Migration {
  override async up(): Promise<void> {
    this.addSql(`
      create table if not exists "social_account" (
        "id" text not null,
        "provider" text check ("provider" in ('instagram')) not null default 'instagram',
        "handle" text not null,
        "profile_url" text not null,
        "status" text check ("status" in ('needs_connection','connected','import_limited','active','error')) not null default 'needs_connection',
        "last_synced_at" timestamptz null,
        "last_error" text null,
        "metadata" jsonb null,
        "created_at" timestamptz not null default now(),
        "updated_at" timestamptz not null default now(),
        "deleted_at" timestamptz null,
        constraint "social_account_pkey" primary key ("id")
      );
    `);

    this.addSql(`
      create table if not exists "social_import_job" (
        "id" text not null,
        "provider" text check ("provider" in ('instagram')) not null default 'instagram',
        "account_id" text null,
        "source_url" text not null,
        "handle" text null,
        "status" text check ("status" in ('queued','running','completed','failed','needs_connection')) not null default 'queued',
        "imported_count" int not null default 0,
        "message" text null,
        "error_message" text null,
        "raw_result" jsonb null,
        "completed_at" timestamptz null,
        "created_at" timestamptz not null default now(),
        "updated_at" timestamptz not null default now(),
        "deleted_at" timestamptz null,
        constraint "social_import_job_pkey" primary key ("id")
      );
    `);

    this.addSql(`create unique index if not exists "IDX_social_account_provider_handle_unique" on "social_account" ("provider", "handle") where deleted_at is null;`);
    this.addSql(`create index if not exists "IDX_social_import_job_status" on "social_import_job" ("status", "created_at") where deleted_at is null;`);

    this.addSql(`alter table if exists "social_gallery_post" add column if not exists "provider" text check ("provider" in ('instagram','manual')) not null default 'manual';`);
    this.addSql(`alter table if exists "social_gallery_post" add column if not exists "provider_media_id" text null;`);
    this.addSql(`alter table if exists "social_gallery_post" add column if not exists "shortcode" text null;`);
    this.addSql(`alter table if exists "social_gallery_post" add column if not exists "permalink" text null;`);
    this.addSql(`alter table if exists "social_gallery_post" add column if not exists "import_status" text check ("import_status" in ('draft','published','archived')) not null default 'published';`);
    this.addSql(`alter table if exists "social_gallery_post" add column if not exists "raw_provider_data" jsonb null;`);
    this.addSql(`alter table if exists "social_gallery_post" add column if not exists "content_hash" text null;`);
    this.addSql(`create unique index if not exists "IDX_social_gallery_post_provider_media_unique" on "social_gallery_post" ("provider", "provider_media_id") where provider_media_id is not null and deleted_at is null;`);
  }

  override async down(): Promise<void> {
    this.addSql(`drop index if exists "IDX_social_gallery_post_provider_media_unique";`);
    this.addSql(`alter table if exists "social_gallery_post" drop column if exists "content_hash";`);
    this.addSql(`alter table if exists "social_gallery_post" drop column if exists "raw_provider_data";`);
    this.addSql(`alter table if exists "social_gallery_post" drop column if exists "import_status";`);
    this.addSql(`alter table if exists "social_gallery_post" drop column if exists "permalink";`);
    this.addSql(`alter table if exists "social_gallery_post" drop column if exists "shortcode";`);
    this.addSql(`alter table if exists "social_gallery_post" drop column if exists "provider_media_id";`);
    this.addSql(`alter table if exists "social_gallery_post" drop column if exists "provider";`);
    this.addSql(`drop table if exists "social_import_job" cascade;`);
    this.addSql(`drop table if exists "social_account" cascade;`);
  }
}
