import { Migration } from '@mikro-orm/migrations';

export class Migration20261001232000 extends Migration {
  override async up(): Promise<void> {
    this.addSql(`
      create table if not exists "social_gallery_post" (
        "id" text not null,
        "title" text not null,
        "caption" text null,
        "source_url" text null,
        "instagram_handle" text null,
        "posted_at" timestamptz null,
        "media_type" text check ("media_type" in ('image','video','carousel')) not null default 'image',
        "media_url" text null,
        "thumbnail_url" text null,
        "poster_url" text null,
        "alt_text" text null,
        "category" text check ("category" in ('dishes','private_dinners','events','behind_the_scenes','press_collabs')) not null default 'dishes',
        "display_style" text check ("display_style" in ('normal','large','wide','feature')) not null default 'normal',
        "linked_service_label" text null,
        "cta_label" text null,
        "cta_url" text null,
        "is_active" boolean not null default true,
        "is_featured" boolean not null default false,
        "sort_order" int not null default 0,
        "created_at" timestamptz not null default now(),
        "updated_at" timestamptz not null default now(),
        "deleted_at" timestamptz null,
        constraint "social_gallery_post_pkey" primary key ("id")
      );
    `);

    this.addSql(
      `create index if not exists "IDX_social_gallery_post_active_sort" on "social_gallery_post" ("is_active", "is_featured", "sort_order") where deleted_at is null;`,
    );
    this.addSql(
      `create index if not exists "IDX_social_gallery_post_category" on "social_gallery_post" ("category") where deleted_at is null;`,
    );
  }

  override async down(): Promise<void> {
    this.addSql(`drop table if exists "social_gallery_post" cascade;`);
  }
}
