import { Migration } from '@mikro-orm/migrations';

export class Migration20260413200000 extends Migration {
  override async up(): Promise<void> {
    this.addSql(`
      create table if not exists "menu_experience_price" (
        "id" text not null,
        "menu_id" text not null,
        "experience_type_id" text not null,
        "price_per_person" numeric not null,
        "raw_price_per_person" jsonb not null,
        "created_at" timestamptz not null default now(),
        "updated_at" timestamptz not null default now(),
        "deleted_at" timestamptz null,
        constraint "menu_experience_price_pkey" primary key ("id")
      );
    `);

    this.addSql(`
      create unique index "IDX_menu_experience_price_menu_experience"
        on "menu_experience_price" ("menu_id", "experience_type_id")
        where "deleted_at" is null;
    `);

    this.addSql(`
      alter table "menu_experience_price"
        add constraint "menu_experience_price_menu_id_foreign"
        foreign key ("menu_id") references "menu" ("id")
        on delete cascade;
    `);
  }

  override async down(): Promise<void> {
    this.addSql(`drop table if exists "menu_experience_price";`);
  }
}
