import { Migration } from '@medusajs/framework/mikro-orm/migrations'

export class Migration20250812120500_add_menu_thumbnail extends Migration {
  override async up(): Promise<void> {
    this.addSql(`alter table if exists "menu" add column if not exists "thumbnail" text null;`)
  }

  override async down(): Promise<void> {
    this.addSql(`alter table if exists "menu" drop column if exists "thumbnail";`)
  }
}

