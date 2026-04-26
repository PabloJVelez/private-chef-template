import { Migration } from "@mikro-orm/migrations"

export class Migration20260426100000 extends Migration {
  override async up(): Promise<void> {
    // Add the column with the application-level default so future inserts that
    // do not explicitly set `status` still match the model definition.
    this.addSql(`
      alter table if exists "menu"
      add column if not exists "status" text not null default 'draft';
    `)

    // Backfill all pre-existing menus to "active" so previously-visible menus
    // remain visible on the storefront after the lifecycle is introduced.
    // Safe because this migration runs exactly once and the column has just
    // been created on this same migration step.
    this.addSql(`
      update "menu"
      set "status" = 'active';
    `)
  }

  override async down(): Promise<void> {
    this.addSql(`
      alter table if exists "menu" drop column if exists "status";
    `)
  }
}
