import { Migration } from '@medusajs/framework/mikro-orm/migrations';

/** Atomic proof for one narrow command, including the commit/checkpoint crash window. */
export class Migration20261113000100 extends Migration {
  async up(): Promise<void> {
    this.addSql(`create table chef_event_schedule_edit (
      id text primary key, input jsonb not null, outcome jsonb not null,
      google_sync text not null check (google_sync in ('not_requested','pending','unknown','requested','failed')),
      created_at timestamptz not null default now()
    );`);
  }
  async down(): Promise<void> {
    this.addSql(`do $$ begin if exists(select 1 from chef_event_schedule_edit) then
      raise exception 'Retain schedule edit recovery receipts; audit before rollback'; end if; end $$;
      drop table chef_event_schedule_edit;`);
  }
}
