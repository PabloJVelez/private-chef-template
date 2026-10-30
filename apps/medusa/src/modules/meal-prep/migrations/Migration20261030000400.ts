import { Migration } from "@mikro-orm/migrations";

/** Additive internal capture storage. No scheduling, commerce or public access. */
export class Migration20261030000400 extends Migration {
  async up(): Promise<void> {
    const timestamps = `created_at timestamptz not null default now(), updated_at timestamptz not null default now(), deleted_at timestamptz null`;
    this.addSql(`create table meal_prep_capture (
      id text primary key, chef_id text not null, customer_id text null,
      kind text not null check (kind in ('offer','household','selection')),
      household_id text null references meal_prep_capture(id) on delete restrict,
      version integer not null default 0 check (version >= 0), ${timestamps},
      unique (id, chef_id, kind),
      check ((kind = 'offer' and customer_id is null and household_id is null)
        or (kind = 'household' and customer_id is not null and household_id is null)
        or (kind = 'selection' and customer_id is not null and household_id is not null))
    );`);
    this.addSql(`create table meal_prep_capture_snapshot (
      id text primary key, capture_id text not null, chef_id text not null, kind text not null,
      revision_number integer not null check (revision_number > 0),
      body jsonb not null check (jsonb_typeof(body) = 'object' and body->>'kind' is not null and body->>'kind' = kind),
      offer_revision_id text null references meal_prep_capture_snapshot(id) on delete restrict,
      intake_revision_id text null references meal_prep_capture_snapshot(id) on delete restrict,
      availability_version integer null check (availability_version >= 0),
      contract_version text not null, created_by text not null, ${timestamps},
      check (deleted_at is null), unique (capture_id, revision_number), unique (id, capture_id),
      foreign key (capture_id, chef_id, kind) references meal_prep_capture(id, chef_id, kind) on delete restrict,
      check ((kind = 'selection' and offer_revision_id is not null and intake_revision_id is not null and availability_version is not null
        and body->>'offerRevisionId' is not null and body->>'intakeRevisionId' is not null
        and body->>'offerRevisionId' = offer_revision_id and body->>'intakeRevisionId' = intake_revision_id)
        or (kind <> 'selection' and offer_revision_id is null and intake_revision_id is null and availability_version is null))
    );`);
    this.addSql(`create table meal_prep_capture_receipt (
      id text primary key, capture_id text not null references meal_prep_capture(id) on delete restrict,
      revision_id text not null, actor_id text not null, idempotency_key text not null,
      request_hash text not null check (request_hash ~ '^[a-f0-9]{64}$'),
      result jsonb not null check (jsonb_typeof(result) = 'object'), ${timestamps},
      check (deleted_at is null), unique (capture_id, actor_id, idempotency_key),
      foreign key (revision_id, capture_id) references meal_prep_capture_snapshot(id, capture_id) on delete restrict
    );`);
    this
      .addSql(`create function meal_prep_capture_guard() returns trigger language plpgsql as $$ declare h meal_prep_capture; begin
      if TG_OP = 'DELETE' then raise exception 'Capture identity cannot be deleted'; end if;
      if TG_OP = 'UPDATE' then
        if (NEW.id,NEW.chef_id,NEW.customer_id,NEW.kind,NEW.household_id,NEW.created_at)
          is distinct from (OLD.id,OLD.chef_id,OLD.customer_id,OLD.kind,OLD.household_id,OLD.created_at)
          then raise exception 'Capture identity is immutable'; end if;
        if NEW.version <> OLD.version + 1 then raise exception 'Capture version must advance by one'; end if;
      end if;
      if NEW.kind = 'selection' then
        select * into h from meal_prep_capture where id = NEW.household_id for share;
        if h.id is null or h.kind <> 'household' or h.deleted_at is not null
          or (h.chef_id,h.customer_id) is distinct from (NEW.chef_id,NEW.customer_id)
          then raise exception 'Invalid household reference'; end if;
      end if;
      return NEW;
    end $$;`);
    this
      .addSql(`create trigger meal_prep_capture_guard before insert or update or delete on meal_prep_capture
      for each row execute function meal_prep_capture_guard();`);
    this
      .addSql(`create function meal_prep_capture_snapshot_guard() returns trigger language plpgsql as $$
      declare c meal_prep_capture; o meal_prep_capture; h meal_prep_capture;
      os meal_prep_capture_snapshot; hs meal_prep_capture_snapshot;
      begin
        select * into c from meal_prep_capture where id = NEW.capture_id for update;
        if c.id is null or c.deleted_at is not null or NEW.revision_number <> c.version
          then raise exception 'Snapshot requires current capture version'; end if;
        if NEW.kind = 'selection' then
          select * into os from meal_prep_capture_snapshot where id = NEW.offer_revision_id;
          select * into hs from meal_prep_capture_snapshot where id = NEW.intake_revision_id;
          select * into o from meal_prep_capture where id = os.capture_id for share;
          select * into h from meal_prep_capture where id = hs.capture_id for share;
          if o.id is null or h.id is null or o.kind <> 'offer' or h.kind <> 'household'
            or o.chef_id <> c.chef_id or h.id <> c.household_id
            or o.deleted_at is not null or h.deleted_at is not null
            or os.revision_number <> o.version or hs.revision_number <> h.version
            then raise exception 'Invalid or stale snapshot reference'; end if;
        end if;
        return NEW;
      end $$;`);
    this
      .addSql(`create trigger meal_prep_capture_snapshot_guard before insert on meal_prep_capture_snapshot
      for each row execute function meal_prep_capture_snapshot_guard();`);
    for (const table of ["snapshot", "receipt"])
      this.addSql(`create trigger meal_prep_capture_${table}_immutable
      before update or delete on meal_prep_capture_${table} for each row execute function meal_prep_immutable();`);
    this.addSql(
      `create index meal_prep_capture_owner on meal_prep_capture(chef_id,customer_id) where deleted_at is null;`,
    );
  }
  async down(): Promise<void> {
    this.addSql(
      `lock table meal_prep_capture, meal_prep_capture_snapshot, meal_prep_capture_receipt in access exclusive mode;`,
    );
    this.addSql(`do $$ begin if exists(select 1 from meal_prep_capture) then
      raise exception 'Capture rollback refused: preserve private history with a forward migration'; end if; end $$;`);
    this.addSql(
      `drop table meal_prep_capture_receipt, meal_prep_capture_snapshot, meal_prep_capture;`,
    );
    this.addSql(
      `drop function meal_prep_capture_snapshot_guard(), meal_prep_capture_guard();`,
    );
  }
}
