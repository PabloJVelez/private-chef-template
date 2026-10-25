import { Migration } from '@mikro-orm/migrations';
export class Migration20261015000200 extends Migration {
  async up(): Promise<void> {
    this.addSql(
      `alter table experience_type add column preparation_minutes integer not null default 0 check (preparation_minutes between 0 and 1440), add column travel_minutes integer not null default 0 check (travel_minutes between 0 and 1440), add column cleanup_minutes integer not null default 0 check (cleanup_minutes between 0 and 1440);`,
    );
  }
  async down(): Promise<void> {
    this.addSql(
      'alter table experience_type drop column preparation_minutes, drop column travel_minutes, drop column cleanup_minutes;',
    );
  }
}
