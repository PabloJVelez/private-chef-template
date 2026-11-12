import { Migration } from '@medusajs/framework/mikro-orm/migrations'

export class Migration20250813160000_add_menu_image_metadata extends Migration {
  override async up(): Promise<void> {
    this.addSql(`alter table if exists "menu_image" add column if not exists "metadata" jsonb null;`)
  }

  override async down(): Promise<void> {
    this.addSql(`alter table if exists "menu_image" drop column if exists "metadata";`)
  }
}

