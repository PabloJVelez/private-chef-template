import { Migration } from '@medusajs/framework/mikro-orm/migrations'

export class Migration20250812120000_add_menu_images extends Migration {
  override async up(): Promise<void> {
    this.addSql(`create table if not exists "menu_image" (
      "id" text not null,
      "menu_id" text not null,
      "url" text not null,
      "rank" int not null default 0,
      "metadata" jsonb null,
      "created_at" timestamptz not null default now(),
      "updated_at" timestamptz not null default now(),
      "deleted_at" timestamptz null,
      constraint "menu_image_pkey" primary key ("id")
    );`)

    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_menu_image_menu_id" ON "menu_image" (menu_id) WHERE deleted_at IS NULL;`)
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_menu_image_deleted_at" ON "menu_image" (deleted_at) WHERE deleted_at IS NULL;`)

    this.addSql(`DO $$
    BEGIN
      ALTER TABLE IF EXISTS "menu_image" ADD CONSTRAINT "menu_image_menu_id_foreign" FOREIGN KEY ("menu_id") REFERENCES "menu" ("id") ON UPDATE CASCADE ON DELETE CASCADE;
    EXCEPTION
      WHEN duplicate_object THEN NULL;
    END $$;`)
  }

  override async down(): Promise<void> {
    this.addSql(`drop table if exists "menu_image" cascade;`)
  }
}

