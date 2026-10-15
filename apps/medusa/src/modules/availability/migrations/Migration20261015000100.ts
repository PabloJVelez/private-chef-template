import { Migration } from '@mikro-orm/migrations';
export class Migration20261015000100 extends Migration {
  async up(): Promise<void> {
    this.addSql(`create table if not exists availability_setting (
      id text primary key, timezone text not null, weekly jsonb not null, overrides jsonb not null,
      google_mode text not null default 'required' check (google_mode in ('required', 'internal_only')),
      created_at timestamptz not null default now(), updated_at timestamptz not null default now(), deleted_at timestamptz null
    );`);
  }
  async down(): Promise<void> {
    this.addSql('drop table if exists availability_setting;');
  }
}
