import { Migration } from "@mikro-orm/migrations";

export class Migration20260309000000_stripe_connect_account extends Migration {
  override async up(): Promise<void> {
    this.addSql(`
      create table if not exists "stripe_connect_account" (
        "id" text not null,
        "stripe_account_id" text not null,
        "details_submitted" boolean not null default false,
        "charges_enabled" boolean not null default false,
        "created_at" timestamptz not null default now(),
        "updated_at" timestamptz not null default now(),
        "deleted_at" timestamptz null,
        constraint "stripe_connect_account_pkey" primary key ("id")
      );
    `);
    this.addSql(
      `create unique index if not exists "stripe_connect_account_stripe_account_id_unique" on "stripe_connect_account" ("stripe_account_id");`,
    );
  }

  override async down(): Promise<void> {
    this.addSql(`drop table if exists "stripe_connect_account" cascade;`);
  }
}
