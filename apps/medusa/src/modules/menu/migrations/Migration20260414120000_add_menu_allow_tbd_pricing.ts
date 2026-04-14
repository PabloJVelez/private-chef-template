import { Migration } from '@mikro-orm/migrations';

export class Migration20260414120000 extends Migration {
  override async up(): Promise<void> {
    this.addSql(`
      alter table if exists "menu"
      add column if not exists "allow_tbd_pricing" boolean not null default false;
    `);
  }

  override async down(): Promise<void> {
    this.addSql(`
      alter table if exists "menu" drop column if exists "allow_tbd_pricing";
    `);
  }
}
