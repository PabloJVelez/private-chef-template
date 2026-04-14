import { Migration } from '@mikro-orm/migrations';

export class Migration20260411000000 extends Migration {
  override async up(): Promise<void> {
    this.addSql(`
      create table if not exists "experience_type" (
        "id" text not null,
        "name" text not null,
        "slug" text not null,
        "description" text not null,
        "short_description" text null,
        "icon" text null,
        "image_url" text null,
        "highlights" jsonb not null default '[]',
        "ideal_for" text null,
        "pricing_type" text check ("pricing_type" in ('per_person','per_item','product_based')) not null default 'per_person',
        "price_per_unit" numeric null,
        "raw_price_per_unit" jsonb null,
        "duration_minutes" int null,
        "duration_display" text null,
        "is_product_based" boolean not null default false,
        "location_type" text check ("location_type" in ('customer','fixed')) not null default 'customer',
        "fixed_location_address" text null,
        "requires_advance_notice" boolean not null default true,
        "advance_notice_days" int not null default 7,
        "available_time_slots" jsonb not null default '[]',
        "time_slot_start" text null,
        "time_slot_end" text null,
        "time_slot_interval_minutes" int not null default 30,
        "min_party_size" int not null default 1,
        "max_party_size" int null,
        "is_active" boolean not null default true,
        "is_featured" boolean not null default false,
        "sort_order" int not null default 0,
        "created_at" timestamptz not null default now(),
        "updated_at" timestamptz not null default now(),
        "deleted_at" timestamptz null,
        constraint "experience_type_pkey" primary key ("id"),
        constraint "experience_type_slug_unique" unique ("slug")
      );
    `);

    this.addSql(
      `create index if not exists "IDX_experience_type_active_sort" on "experience_type" ("is_active", "sort_order");`,
    );
    this.addSql(`create index if not exists "IDX_experience_type_slug" on "experience_type" ("slug");`);

    this.addSql(`alter table if exists "chef_event" add column if not exists "experience_type_id" text null;`);
    this.addSql(
      `alter table if exists "chef_event" add constraint "chef_event_experience_type_id_foreign" foreign key ("experience_type_id") references "experience_type" ("id") on update cascade on delete set null;`,
    );
  }

  override async down(): Promise<void> {
    this.addSql(
      `alter table if exists "chef_event" drop constraint if exists "chef_event_experience_type_id_foreign";`,
    );
    this.addSql(`alter table if exists "chef_event" drop column if exists "experience_type_id";`);
    this.addSql(`drop table if exists "experience_type" cascade;`);
  }
}
