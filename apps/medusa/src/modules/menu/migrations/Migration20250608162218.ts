import { Migration } from '@medusajs/framework/mikro-orm/migrations';

export class Migration20250608162218 extends Migration {

  override async up(): Promise<void> {
    this.addSql(`create table if not exists "menu" ("id" text not null, "name" text not null, "created_at" timestamptz not null default now(), "updated_at" timestamptz not null default now(), "deleted_at" timestamptz null, constraint "menu_pkey" primary key ("id"));`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_menu_deleted_at" ON "menu" (deleted_at) WHERE deleted_at IS NULL;`);

    this.addSql(`create table if not exists "course" ("id" text not null, "name" text not null, "menu_id" text not null, "created_at" timestamptz not null default now(), "updated_at" timestamptz not null default now(), "deleted_at" timestamptz null, constraint "course_pkey" primary key ("id"));`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_course_menu_id" ON "course" (menu_id) WHERE deleted_at IS NULL;`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_course_deleted_at" ON "course" (deleted_at) WHERE deleted_at IS NULL;`);

    this.addSql(`create table if not exists "dish" ("id" text not null, "name" text not null, "description" text null, "course_id" text not null, "created_at" timestamptz not null default now(), "updated_at" timestamptz not null default now(), "deleted_at" timestamptz null, constraint "dish_pkey" primary key ("id"));`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_dish_course_id" ON "dish" (course_id) WHERE deleted_at IS NULL;`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_dish_deleted_at" ON "dish" (deleted_at) WHERE deleted_at IS NULL;`);

    this.addSql(`create table if not exists "ingredient" ("id" text not null, "name" text not null, "optional" boolean null, "dish_id" text not null, "created_at" timestamptz not null default now(), "updated_at" timestamptz not null default now(), "deleted_at" timestamptz null, constraint "ingredient_pkey" primary key ("id"));`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_ingredient_dish_id" ON "ingredient" (dish_id) WHERE deleted_at IS NULL;`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_ingredient_deleted_at" ON "ingredient" (deleted_at) WHERE deleted_at IS NULL;`);

    this.addSql(`alter table if exists "course" add constraint "course_menu_id_foreign" foreign key ("menu_id") references "menu" ("id") on update cascade on delete cascade;`);

    this.addSql(`alter table if exists "dish" add constraint "dish_course_id_foreign" foreign key ("course_id") references "course" ("id") on update cascade on delete cascade;`);

    this.addSql(`alter table if exists "ingredient" add constraint "ingredient_dish_id_foreign" foreign key ("dish_id") references "dish" ("id") on update cascade on delete cascade;`);
  }

  override async down(): Promise<void> {
    this.addSql(`alter table if exists "course" drop constraint if exists "course_menu_id_foreign";`);

    this.addSql(`alter table if exists "dish" drop constraint if exists "dish_course_id_foreign";`);

    this.addSql(`alter table if exists "ingredient" drop constraint if exists "ingredient_dish_id_foreign";`);

    this.addSql(`drop table if exists "menu" cascade;`);

    this.addSql(`drop table if exists "course" cascade;`);

    this.addSql(`drop table if exists "dish" cascade;`);

    this.addSql(`drop table if exists "ingredient" cascade;`);
  }

}
