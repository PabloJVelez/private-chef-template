import { Migration } from "@mikro-orm/migrations";

export class Migration20260824135000_add_stripe_connect_account_types extends Migration {
  override async up(): Promise<void> {
    this.addSql(`
      alter table if exists "stripe_connect_account"
        add column if not exists "account_type" text check ("account_type" in ('express','standard')) not null default 'express',
        add column if not exists "connection_method" text check ("connection_method" in ('platform_onboarding','oauth')) not null default 'platform_onboarding',
        add column if not exists "payouts_enabled" boolean not null default false,
        add column if not exists "connected_at" timestamptz null,
        add column if not exists "disconnected_at" timestamptz null;
    `);

    this.addSql(`
      update "stripe_connect_account"
      set "connected_at" = coalesce("connected_at", "created_at")
      where "deleted_at" is null
        and "connected_at" is null;
    `);
  }

  override async down(): Promise<void> {
    this.addSql(`
      alter table if exists "stripe_connect_account"
        drop column if exists "disconnected_at",
        drop column if exists "connected_at",
        drop column if exists "payouts_enabled",
        drop column if exists "connection_method",
        drop column if exists "account_type";
    `);
  }
}
