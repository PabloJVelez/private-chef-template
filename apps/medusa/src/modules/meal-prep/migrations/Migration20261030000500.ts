import { Migration } from "@mikro-orm/migrations";

/** Append-only workflow projection. No scheduling, payment or legacy table changes. */
export class Migration20261030000500 extends Migration {
  async up(): Promise<void> {
    this.addSql(`create table meal_prep_approval_state (
      id text primary key, subject_id text not null references meal_prep_subject(id),
      revision_id text not null, version integer not null check(version > 0),
      body jsonb not null check(jsonb_typeof(body) = 'object'),
      created_at timestamptz not null default now(), updated_at timestamptz not null default now(), deleted_at timestamptz check(deleted_at is null),
      unique(subject_id,version), foreign key(revision_id,subject_id) references meal_prep_revision(id,subject_id)
    );`);
    this
      .addSql(`create function meal_prep_approval_state_guard() returns trigger language plpgsql as $$
      declare s meal_prep_subject; r meal_prep_revision; previous jsonb;
      begin
        select * into s from meal_prep_subject where id=NEW.subject_id for update;
        select * into r from meal_prep_revision where id=NEW.revision_id;
        if s.deleted_at is not null or s.version <> NEW.version or r.revision_number <> NEW.version
          then raise exception 'Approval state requires current revision'; end if;
        if not exists(select 1 from meal_prep_capture h where h.id=NEW.body->>'householdId'
          and h.kind='household' and h.chef_id=s.chef_id and h.customer_id=s.customer_id and h.deleted_at is null)
          then raise exception 'Approval state requires owned household'; end if;
        if not exists(select 1 from meal_prep_revision a where a.id=NEW.body->>'arrangementRevisionId'
          and a.kind='arrangement' and a.subject_id=case when s.kind='arrangement' then s.id else s.parent_id end)
          then raise exception 'Approval state requires arrangement revision'; end if;
        if NEW.body->>'arrangementApproved'='true' and not exists(select 1 from meal_prep_approval a
          where a.revision_id=NEW.body->>'arrangementRevisionId' and a.decision='approved')
          then raise exception 'Arrangement requires separate approval'; end if;
        if s.kind='occurrence' and ((NEW.body->'candidate'->>'generationKey') is distinct from s.generation_key
          or (NEW.body->'candidate'->>'occurrenceId') is distinct from s.id)
          then raise exception 'Candidate identity must match subject'; end if;
        if NEW.body->>'confirmedMenuRevisionId' is not null and not exists(select 1 from meal_prep_approval a
          where a.subject_id=s.id and a.revision_id=NEW.body->>'confirmedMenuRevisionId' and a.decision='approved' and a.revision_kind in ('menu','change'))
          then raise exception 'Confirmed menu requires occurrence approval'; end if;
        select body into previous from meal_prep_approval_state where subject_id=s.id order by version desc limit 1;
        if previous is not null and (NEW.body->'candidate',NEW.body->'householdId',NEW.body->'method',NEW.body->'arrangementRevisionId')
          is distinct from (previous->'candidate',previous->'householdId',previous->'method',previous->'arrangementRevisionId')
          then raise exception 'Confirmed identity changes require a future policy-approved workflow'; end if;
        return NEW;
      end $$;`);
    this.addSql(
      `create trigger meal_prep_approval_state_guard before insert on meal_prep_approval_state for each row execute function meal_prep_approval_state_guard();`,
    );
    this.addSql(
      `create trigger meal_prep_approval_state_immutable before update or delete on meal_prep_approval_state for each row execute function meal_prep_immutable();`,
    );
  }
  async down(): Promise<void> {
    this.addSql(
      `lock table meal_prep_approval_state in access exclusive mode;`,
    );
    this.addSql(
      `do $$ begin if exists(select 1 from meal_prep_approval_state) then raise exception 'Approval rollback refused: preserve workflow history'; end if; end $$;`,
    );
    this.addSql(
      `drop table meal_prep_approval_state; drop function meal_prep_approval_state_guard();`,
    );
  }
}
