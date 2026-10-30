import { Migration } from "@mikro-orm/migrations";

/** Explicit cross-module bridge. Run transactionally after all source migrations.
 * No asynchronous subscriber or application dual-write can replace these triggers.
 */
export class Migration20261030000200 extends Migration {
  async up(): Promise<void> {
    this.addSql(`do $$ begin
      if to_regclass('meal_prep_subject') is null or to_regclass('availability_setting') is null
        or not exists (select 1 from pg_constraint where conrelid = to_regclass('chef_event') and conname = 'chef_event_no_overlap')
      then raise exception 'Shared scheduling requires meal-prep foundations and Availability event migrations first'; end if;
    end $$;`);
    // Freeze writers through audit, backfill and trigger installation. No guessed
    // durations, no skipped overlaps, and no period with unprotected dual writers.
    this.addSql("lock table chef_event in share row exclusive mode;");
    this.addSql(`do $$ begin
      if exists (select 1 from chef_event where deleted_at is null
        and (status in ('confirmed','completed') or "acceptanceToken" is not null)
        and ("occupiedStart" is null or "occupiedEnd" is null or not isfinite("occupiedStart")
          or not isfinite("occupiedEnd") or "occupiedEnd" <= "occupiedStart"))
      then raise exception 'Shared scheduling: audit legacy occupied intervals before retrying'; end if;
      if exists (select 1 from chef_event a join chef_event b on a.id < b.id
        and tstzrange(a."occupiedStart", a."occupiedEnd", '[)') && tstzrange(b."occupiedStart", b."occupiedEnd", '[)')
        where a.deleted_at is null and b.deleted_at is null
          and (a.status in ('confirmed','completed') or a."acceptanceToken" is not null)
          and (b.status in ('confirmed','completed') or b."acceptanceToken" is not null))
      then raise exception 'Shared scheduling: audit legacy overlapping occupied intervals before retrying'; end if;
    end $$;`);
    this.addSql(
      "create extension if not exists btree_gist with schema public;",
    );
    this.addSql(`create table chef_work_block (
      id text primary key, resource_id text not null check (resource_id = 'chef-default'),
      chef_id text not null, purpose text not null check (purpose in ('in_home','preparation','delivery','handoff')),
      starts_at timestamptz not null, ends_at timestamptz not null,
      version integer not null default 1 check (version > 0), released_at timestamptz,
      created_at timestamptz not null default now(), updated_at timestamptz not null default now(), deleted_at timestamptz,
      unique (id, chef_id),
      check (isfinite(starts_at) and isfinite(ends_at) and ends_at > starts_at)
    );`);
    this.addSql(`create table chef_work_block_occurrence (
      block_id text not null, occurrence_id text not null, chef_id text not null, customer_id text not null,
      subject_kind text not null check (subject_kind = 'occurrence'),
      created_at timestamptz not null default now(), primary key (block_id, occurrence_id),
      foreign key (block_id, chef_id) references chef_work_block(id, chef_id) on delete restrict,
      foreign key (occurrence_id, chef_id, customer_id, subject_kind)
        references meal_prep_subject(id, chef_id, customer_id, kind) on delete restrict
    );`);
    this.addSql(`create table chef_time_reservation (
      source_kind text not null check (source_kind in ('private_event','meal_prep_work')),
      source_id text not null, resource_id text not null check (resource_id = 'chef-default'),
      starts_at timestamptz, ends_at timestamptz, active boolean not null,
      claim_token text, source_version text not null,
      primary key (source_kind, source_id),
      constraint chef_time_reservation_valid check (not active or
        (starts_at is not null and ends_at is not null and isfinite(starts_at) and isfinite(ends_at) and ends_at > starts_at)),
      constraint chef_time_reservation_no_overlap exclude using gist
        (resource_id with =, tstzrange(starts_at, ends_at, '[)') with &&) where (active)
    );`);
    this.addSql(`create view chef_time_reservation_expected as
      select 'private_event'::text as source_kind, id as source_id, 'chef-default'::text as resource_id,
        "occupiedStart" as starts_at, "occupiedEnd" as ends_at,
        deleted_at is null and (status in ('confirmed','completed') or "acceptanceToken" is not null) as active,
        "acceptanceToken" as claim_token, coalesce(extract(epoch from updated_at)::text, '0') as source_version
      from chef_event
      union all
      select 'meal_prep_work', id, resource_id, starts_at, ends_at,
        released_at is null and deleted_at is null, null::text, version::text from chef_work_block;`);
    this.addSql(
      `insert into chef_time_reservation select * from chef_time_reservation_expected;`,
    );
    this.addSql(`create view chef_time_reservation_drift as
      select source_kind, source_id from (
        (select * from chef_time_reservation_expected except select * from chef_time_reservation)
        union all
        (select * from chef_time_reservation except select * from chef_time_reservation_expected)
      ) differences;`);
    this
      .addSql(`do $$ begin if exists(select 1 from chef_time_reservation_drift)
      then raise exception 'Shared scheduling backfill parity failed'; end if; end $$;`);
    this
      .addSql(`create function project_chef_time() returns trigger language plpgsql as $$
      declare kind text := TG_ARGV[0];
      begin
        if TG_OP = 'DELETE' then
          delete from chef_time_reservation where source_kind = kind and source_id = OLD.id;
          return OLD;
        end if;
        if TG_OP = 'UPDATE' and NEW.id is distinct from OLD.id then
          raise exception 'Scheduling source identity is immutable';
        end if;
        insert into chef_time_reservation
          select * from chef_time_reservation_expected where source_kind = kind and source_id = NEW.id
          on conflict (source_kind, source_id) do update set
            resource_id = excluded.resource_id, starts_at = excluded.starts_at, ends_at = excluded.ends_at,
            active = excluded.active, claim_token = excluded.claim_token, source_version = excluded.source_version;
        return NEW;
      end $$;
      create trigger chef_event_shared_time after insert or update or delete on chef_event
        for each row execute function project_chef_time('private_event');
      create trigger chef_work_block_shared_time after insert or update or delete on chef_work_block
        for each row execute function project_chef_time('meal_prep_work');`);
    this
      .addSql(`create function guard_chef_time_projection() returns trigger language plpgsql as $$ begin
      if pg_trigger_depth() < 2 then raise exception 'Reservation projection is source-owned'; end if;
      if TG_OP <> 'DELETE' and not exists (
        select 1 from chef_time_reservation_expected e where e.source_kind = NEW.source_kind and e.source_id = NEW.source_id
          and row(e.*) is not distinct from row(NEW.*))
      then raise exception 'Reservation projection differs from source'; end if;
      if TG_OP = 'DELETE' then
        if exists(select 1 from chef_time_reservation_expected where source_kind = OLD.source_kind and source_id = OLD.source_id)
          then raise exception 'Cannot remove reservation for an existing source'; end if;
        return OLD;
      end if;
      return NEW;
    end $$;
    create trigger chef_time_projection_guard before insert or update or delete on chef_time_reservation
      for each row execute function guard_chef_time_projection();`);
    this
      .addSql(`create function guard_chef_work_block() returns trigger language plpgsql as $$ begin
      if TG_OP = 'DELETE' then raise exception 'Work block history cannot be deleted'; end if;
      if (NEW.id, NEW.chef_id, NEW.resource_id, NEW.purpose, NEW.created_at)
        is distinct from (OLD.id, OLD.chef_id, OLD.resource_id, OLD.purpose, OLD.created_at)
        then raise exception 'Work block identity is immutable'; end if;
      if NEW.version <> OLD.version + 1 then raise exception 'Work block version must advance by one'; end if;
      if OLD.released_at is not null or OLD.deleted_at is not null then raise exception 'Released work block is immutable'; end if;
      if exists(select 1 from chef_work_block_occurrence where block_id = OLD.id)
        then raise exception 'Linked work requires approval for every occurrence before changing or releasing its block'; end if;
      return NEW;
    end $$;
    create trigger chef_work_block_guard before update or delete on chef_work_block
      for each row execute function guard_chef_work_block();`);
    this
      .addSql(`create function guard_chef_work_link() returns trigger language plpgsql as $$
      declare b chef_work_block; s meal_prep_subject;
      begin
        if TG_OP <> 'INSERT' then raise exception 'Work links require an approved occurrence change workflow'; end if;
        -- Serialize linking against block movement/release; no count-derived capacity.
        select * into b from chef_work_block where id = NEW.block_id for update;
        select * into s from meal_prep_subject where id = NEW.occurrence_id for update;
        if b.id is null or b.released_at is not null or b.deleted_at is not null or s.id is null or s.deleted_at is not null
          then raise exception 'Work link needs an active block and occurrence'; end if;
        if b.purpose = 'in_home' and exists(select 1 from chef_work_block_occurrence where block_id = b.id)
          then raise exception 'In-home work belongs to one occurrence'; end if;
        return NEW;
      end $$;
      create trigger chef_work_link_guard before insert or update or delete on chef_work_block_occurrence
        for each row execute function guard_chef_work_link();`);
    // TRUNCATE bypasses row triggers. Refuse it even on a disabled feature;
    // database owners doing maintenance must use a reviewed migration instead.
    this
      .addSql(`create function guard_shared_time_truncate() returns trigger language plpgsql as $$ begin
      raise exception 'Shared scheduling sources/projections cannot be truncated'; end $$;`);
    for (const table of [
      "chef_event",
      "chef_work_block",
      "chef_work_block_occurrence",
      "chef_time_reservation",
    ]) {
      this
        .addSql(`create trigger shared_time_no_truncate before truncate on ${table}
        for each statement execute function guard_shared_time_truncate();`);
    }
  }

  async down(): Promise<void> {
    this.addSql(
      "lock table chef_event, chef_work_block, chef_work_block_occurrence, chef_time_reservation in access exclusive mode;",
    );
    // Fail before removing any cross-domain protection or history, even when the
    // feature is disabled or all blocks have been released.
    this.addSql(`do $$ begin
      if exists(select 1 from chef_work_block) or exists(select 1 from chef_work_block_occurrence)
        or exists(select 1 from chef_time_reservation where source_kind = 'meal_prep_work')
      then raise exception 'Shared scheduling rollback refused: preserve meal-prep work and use a forward migration'; end if;
      if exists(select 1 from chef_time_reservation_drift)
      then raise exception 'Shared scheduling rollback refused: reconcile projection drift first'; end if;
    end $$;`);
    this.addSql(`drop trigger chef_event_shared_time on chef_event;
      drop trigger shared_time_no_truncate on chef_event;
      drop view chef_time_reservation_drift; drop view chef_time_reservation_expected;
      drop table chef_work_block_occurrence; drop table chef_work_block; drop table chef_time_reservation;
      drop function project_chef_time(); drop function guard_chef_time_projection();
      drop function guard_chef_work_block(); drop function guard_chef_work_link(); drop function guard_shared_time_truncate();`);
    // Keep btree_gist: other modules/installations may already depend on it.
  }
}
