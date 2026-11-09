import { Migration } from '@mikro-orm/migrations';

export class Migration20261109000100 extends Migration {
  async up(): Promise<void> {
    this.addSql(`create table chef_event_acceptance_attempt (
      id text primary key, event_id text not null, actor_id text not null, request_key text not null,
      input jsonb not null, state text not null default 'active' check(state in ('active','finalized','aborted')),
      created_at timestamptz not null default now(), updated_at timestamptz not null default now(), deleted_at timestamptz,
      unique(event_id, actor_id, request_key)
    );
    alter table chef_event add column "acceptanceExecution" text;
    create index on chef_event_acceptance_attempt(event_id);`);
  }
  async down(): Promise<void> {
    this.addSql(`do $$ begin if exists(select 1 from chef_event_acceptance_attempt) then
      raise exception 'Drain and audit acceptance attempts before rollback'; end if; end $$;
      alter table chef_event drop column "acceptanceExecution";
      drop table chef_event_acceptance_attempt;`);
  }
}
