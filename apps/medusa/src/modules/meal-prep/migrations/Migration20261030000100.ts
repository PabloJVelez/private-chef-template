import { Migration } from "@mikro-orm/migrations";

/** Additive only: no event, Availability, commerce or provider tables touched. */
export class Migration20261030000100 extends Migration {
  async up(): Promise<void> {
    const timestamps = `created_at timestamptz not null default now(), updated_at timestamptz not null default now(), deleted_at timestamptz null`;
    this.addSql(`create table meal_prep_subject (
      id text primary key, chef_id text not null, customer_id text not null,
      kind text not null check (kind in ('arrangement','occurrence')),
      parent_id text null, parent_kind text null, generation_key text null,
      version integer not null default 0 check (version >= 0), ${timestamps},
      unique (id, chef_id, customer_id, kind), unique (chef_id, generation_key),
      check ((kind = 'arrangement' and parent_id is null and parent_kind is null and generation_key is null)
        or (kind = 'occurrence' and parent_id is not null and parent_kind is not null and parent_kind = 'arrangement' and generation_key is not null)),
      foreign key (parent_id, chef_id, customer_id, parent_kind)
        references meal_prep_subject (id, chef_id, customer_id, kind) on delete restrict
    );`);
    this.addSql(`create table meal_prep_revision (
      id text primary key, subject_id text not null references meal_prep_subject(id) on delete restrict,
      kind text not null check (kind in ('arrangement','menu','quote','change')),
      revision_number integer not null check (revision_number > 0),
      body jsonb not null check (jsonb_typeof(body) = 'object'),
      contract_version text not null, created_by text not null, ${timestamps},
      unique (subject_id, revision_number), unique (id, subject_id, kind), unique (id, subject_id)
    );`);
    this.addSql(`create table meal_prep_approval (
      id text primary key, subject_id text not null, revision_id text not null,
      revision_kind text not null check (revision_kind in ('arrangement','menu','quote','change')),
      decision text not null check (decision in ('approved','rejected')),
      chef_actor_id text not null, expected_version integer not null check (expected_version >= 0),
      contract_version text not null, ${timestamps}, unique (revision_id),
      foreign key (revision_id, subject_id, revision_kind) references meal_prep_revision(id, subject_id, kind) on delete restrict
    );`);
    // One initial arrangement approval; later amendments use change revisions.
    this.addSql(`create unique index meal_prep_arrangement_approved_once on meal_prep_approval (subject_id)
      where revision_kind = 'arrangement' and decision = 'approved';`);
    this.addSql(`create table meal_prep_change_request (
      id text primary key, subject_id text not null, revision_id text not null,
      revision_kind text not null check (revision_kind = 'change'),
      request_type text not null check (request_type in ('menu','portions','reschedule','skip','pause')),
      base_version integer not null check (base_version >= 0), requested_by text not null,
      ${timestamps}, unique (revision_id),
      foreign key (revision_id, subject_id, revision_kind) references meal_prep_revision(id, subject_id, kind) on delete restrict
    );`);
    this.addSql(`create table meal_prep_audit (
      id text primary key, subject_id text not null, revision_id text not null,
      actor_id text not null, action text not null, resulting_version integer not null check (resulting_version > 0),
      contract_version text not null, ${timestamps},
      foreign key (revision_id, subject_id) references meal_prep_revision(id, subject_id) on delete restrict
    );`);
    this.addSql(`create table meal_prep_outbox (
      id text primary key, subject_id text not null, revision_id text not null,
      topic text not null, deduplication_key text not null unique, contract_version text not null,
      attempts integer not null default 0 check (attempts >= 0), delivered_at timestamptz null, ${timestamps},
      foreign key (revision_id, subject_id) references meal_prep_revision(id, subject_id) on delete restrict
    );`);
    this.addSql(
      `create index meal_prep_outbox_pending on meal_prep_outbox (created_at, id) where delivered_at is null and deleted_at is null;`,
    );
    this.addSql(`create table meal_prep_command (
      id text primary key, subject_id text not null references meal_prep_subject(id) on delete restrict,
      actor_id text not null, operation text not null, idempotency_key text not null,
      request_hash text not null check (request_hash ~ '^[a-f0-9]{64}$'),
      result jsonb not null check (jsonb_typeof(result) = 'object'), ${timestamps},
      unique (subject_id, actor_id, operation, idempotency_key)
    );`);
    // Never reuse identities after soft deletion; historical deduplication is durable.
    this
      .addSql(`create function meal_prep_immutable() returns trigger language plpgsql as $$
      begin raise exception 'Meal prep history is append-only'; end $$;`);
    for (const table of [
      "revision",
      "approval",
      "change_request",
      "audit",
      "command",
    ]) {
      this
        .addSql(`create trigger meal_prep_${table}_immutable before update or delete on meal_prep_${table}
        for each row execute function meal_prep_immutable();`);
      this.addSql(
        `alter table meal_prep_${table} add constraint meal_prep_${table}_not_deleted check (deleted_at is null);`,
      );
    }
    this
      .addSql(`create function meal_prep_subject_guard() returns trigger language plpgsql as $$ begin
      if TG_OP = 'DELETE' then raise exception 'Meal prep subject identities cannot be deleted'; end if;
      if (NEW.id, NEW.chef_id, NEW.customer_id, NEW.kind, NEW.parent_id, NEW.parent_kind, NEW.generation_key, NEW.created_at)
        is distinct from (OLD.id, OLD.chef_id, OLD.customer_id, OLD.kind, OLD.parent_id, OLD.parent_kind, OLD.generation_key, OLD.created_at)
        then raise exception 'Meal prep subject identity is immutable'; end if;
      if NEW.version <> OLD.version + 1 then raise exception 'Meal prep version must advance by one'; end if;
      return NEW;
    end $$;`);
    this.addSql(
      `create trigger meal_prep_subject_guard before update or delete on meal_prep_subject for each row execute function meal_prep_subject_guard();`,
    );
    this
      .addSql(`create function meal_prep_revision_guard() returns trigger language plpgsql as $$ declare s meal_prep_subject; begin
      select * into s from meal_prep_subject where id = NEW.subject_id for update;
      if s.id is null or s.deleted_at is not null or NEW.revision_number <> s.version
        then raise exception 'Meal prep revision requires current subject version'; end if;
      if (s.kind = 'arrangement' and NEW.kind not in ('arrangement','change'))
        or (s.kind = 'occurrence' and NEW.kind not in ('menu','quote','change'))
        then raise exception 'Meal prep revision kind does not match subject'; end if;
      return NEW;
    end $$;`);
    this.addSql(
      `create trigger meal_prep_revision_guard before insert on meal_prep_revision for each row execute function meal_prep_revision_guard();`,
    );
    // Delivery bookkeeping can change later, but a retry cannot change event identity/content.
    this
      .addSql(`create function meal_prep_outbox_guard() returns trigger language plpgsql as $$ begin
      if TG_OP = 'DELETE' then raise exception 'Meal prep outbox history cannot be deleted'; end if;
      if (NEW.id, NEW.subject_id, NEW.revision_id, NEW.topic, NEW.deduplication_key, NEW.contract_version, NEW.created_at, NEW.deleted_at)
        is distinct from (OLD.id, OLD.subject_id, OLD.revision_id, OLD.topic, OLD.deduplication_key, OLD.contract_version, OLD.created_at, OLD.deleted_at)
        then raise exception 'Meal prep outbox identity is immutable'; end if;
      if NEW.attempts < OLD.attempts or (OLD.delivered_at is not null and NEW.delivered_at is distinct from OLD.delivered_at)
        then raise exception 'Meal prep outbox delivery cannot move backwards'; end if;
      return NEW;
    end $$;`);
    this.addSql(
      `alter table meal_prep_outbox add constraint meal_prep_outbox_not_deleted check (deleted_at is null);`,
    );
    this.addSql(
      `create trigger meal_prep_outbox_guard before update or delete on meal_prep_outbox for each row execute function meal_prep_outbox_guard();`,
    );
  }

  async down(): Promise<void> {
    // Refuse silent history loss. Forward fixes are required once any data exists.
    // Hold through the migration transaction so a new subject cannot race the check.
    this.addSql('lock table meal_prep_subject in access exclusive mode;');
    this.addSql(`do $$ begin if exists(select 1 from meal_prep_subject)
      then raise exception 'Meal prep rollback refused: preserve existing records and use a forward migration'; end if; end $$;`);
    for (const table of [
      "command",
      "outbox",
      "audit",
      "change_request",
      "approval",
      "revision",
      "subject",
    ]) {
      this.addSql(`drop table meal_prep_${table};`);
    }
    for (const fn of [
      "outbox_guard",
      "revision_guard",
      "subject_guard",
      "immutable",
    ]) {
      this.addSql(`drop function meal_prep_${fn}();`);
    }
  }
}
