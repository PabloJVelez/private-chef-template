import { Migration } from '@medusajs/framework/mikro-orm/migrations';

/** Additive schema only. Application wiring and the legacy authority switch are separate. */
export class Migration20261109000200 extends Migration {
  async up(): Promise<void> {
    this.addSql(`      create table scheduling_reservation (
        id text primary key, owner_id text not null, attempt_id text not null,
        starts_at timestamptz not null, ends_at timestamptz not null,
        state text not null default 'held' check(state in ('held','confirmed','released')),
        created_at timestamptz not null default now(), updated_at timestamptz not null default now(), deleted_at timestamptz,
        constraint scheduling_interval_valid check (isfinite(starts_at) and isfinite(ends_at) and starts_at < ends_at),
        constraint scheduling_no_overlap exclude using gist (tstzrange(starts_at, ends_at, '[)') with &&)
          where (deleted_at is null and state in ('held','confirmed')),
        unique(owner_id, attempt_id)
      );
      create index on scheduling_reservation(deleted_at) where deleted_at is null;
`);
  }
  async down(): Promise<void> {
    this
      .addSql(`do $$ begin if exists(select 1 from scheduling_reservation where state in ('held','confirmed') and deleted_at is null) then
      raise exception 'Resolve protected reservations before removing Scheduling'; end if; end $$;
      drop table scheduling_reservation;`);
  }
}
