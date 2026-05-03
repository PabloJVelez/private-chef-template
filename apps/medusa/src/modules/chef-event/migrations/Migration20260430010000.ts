import { Migration } from "@mikro-orm/migrations"

export class Migration20260430010000 extends Migration {
  override async up(): Promise<void> {
    this.addSql(
      `alter table if exists "chef_event" add column if not exists "additionalCharges" jsonb null;`
    )
  }

  override async down(): Promise<void> {
    this.addSql(
      `alter table if exists "chef_event" drop column if exists "additionalCharges";`
    )
  }
}
