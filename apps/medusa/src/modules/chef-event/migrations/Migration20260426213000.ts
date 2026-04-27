import { Migration } from "@mikro-orm/migrations"

export class Migration20260426213000 extends Migration {
  override async up(): Promise<void> {
    this.addSql(
      `alter table if exists "chef_event" add column if not exists "eventMenuId" text null;`
    )
  }

  override async down(): Promise<void> {
    this.addSql(
      `alter table if exists "chef_event" drop column if exists "eventMenuId";`
    )
  }
}
