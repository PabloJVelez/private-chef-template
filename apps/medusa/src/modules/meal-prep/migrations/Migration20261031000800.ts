import { Migration } from "@mikro-orm/migrations";

/** Test-only operational history. No changes to payment or scheduling tables. */
export class Migration20261031000800 extends Migration {
  async up(): Promise<void> {
    this.addSql(`create table meal_prep_fulfillment_event (
      id text primary key, subject_id text not null references meal_prep_subject(id),
      version integer not null check(version>0), actor_id text not null,
      kind text not null check(kind in ('plan','progress','flag_follow_up','resolve_follow_up')),
      method text not null check(method in ('in_home','delivery','pickup')),
      plan_id text, status text, reason text, resolves_id text,
      snapshot jsonb, test_only boolean not null check(test_only),
      created_at timestamptz not null default now(),
      unique(subject_id,version), unique(id,subject_id),
      foreign key(plan_id,subject_id) references meal_prep_fulfillment_event(id,subject_id),
      foreign key(resolves_id,subject_id) references meal_prep_fulfillment_event(id,subject_id),
      check(
        (kind='plan' and status is not null and status='planned' and snapshot is not null and plan_id is null and reason is null and resolves_id is null) or
        (kind='progress' and status is not null and snapshot is null and plan_id is not null and reason is null and resolves_id is null) or
        (kind='flag_follow_up' and reason is not null and reason in ('operational_review','handoff_issue') and status is null and snapshot is null and plan_id is null and resolves_id is null) or
        (kind='resolve_follow_up' and resolves_id is not null and status is null and snapshot is null and plan_id is null and reason is null)
      )
    );
    create unique index meal_prep_fulfillment_resolution on meal_prep_fulfillment_event(resolves_id) where resolves_id is not null;
    create index meal_prep_fulfillment_history on meal_prep_fulfillment_event(subject_id,version desc);
    create trigger meal_prep_fulfillment_immutable before update or delete on meal_prep_fulfillment_event
      for each row execute function meal_prep_immutable();
    create function meal_prep_fulfillment_guard() returns trigger language plpgsql as $$
    declare s meal_prep_subject%rowtype; a jsonb; p meal_prep_fulfillment_event%rowtype; previous text;
    begin
      select * into s from meal_prep_subject where id=NEW.subject_id for update;
      select body into a from meal_prep_approval_state where subject_id=NEW.subject_id order by version desc limit 1;
      if s.kind is distinct from 'occurrence' or s.deleted_at is not null or s.version<>NEW.version
        or (a->>'method') is distinct from NEW.method then raise exception 'Invalid fulfillment occurrence'; end if;
      if NEW.kind='plan' then
        if (NEW.snapshot->>'menuRevisionId') is distinct from (a->>'confirmedMenuRevisionId')
          or a->>'confirmedMenuRevisionId' is null
          or (NEW.snapshot->'details'->>'method') is distinct from NEW.method
          or (NEW.snapshot->'candidate') is distinct from (a->'candidate')
          or (NEW.snapshot->'workBlockIds') is distinct from (a->'workBlockIds')
          or (NEW.snapshot->>'policyFixture') is distinct from 'test-only-unresolved-D02-D03-D08'
          then raise exception 'Fulfillment requires approved menu and fixture'; end if;
        if exists(select 1 from meal_prep_fulfillment_event where subject_id=NEW.subject_id and kind='progress')
          then raise exception 'Started fulfillment cannot be replanned'; end if;
      elsif NEW.kind='progress' then
        select * into p from meal_prep_fulfillment_event where subject_id=NEW.subject_id and kind='plan' order by version desc limit 1;
        if p.id is distinct from NEW.plan_id or p.method is distinct from NEW.method
          or (p.snapshot->>'menuRevisionId') is distinct from (a->>'confirmedMenuRevisionId')
          or (p.snapshot->'candidate') is distinct from (a->'candidate')
          or (p.snapshot->'workBlockIds') is distinct from (a->'workBlockIds')
          then raise exception 'Stale fulfillment plan'; end if;
        select status into previous from meal_prep_fulfillment_event where plan_id=p.id order by version desc limit 1;
        previous:=coalesce(previous,'planned');
        if not ((NEW.method='in_home' and (previous,NEW.status) in (('planned','in_progress'),('in_progress','completed')))
          or (NEW.method='delivery' and (previous,NEW.status) in (('planned','preparing'),('preparing','ready'),('ready','dispatched'),('dispatched','delivered')))
          or (NEW.method='pickup' and (previous,NEW.status) in (('planned','preparing'),('preparing','ready'),('ready','collected'))))
          then raise exception 'Invalid fulfillment transition'; end if;
      elsif NEW.kind='resolve_follow_up' then
        if not exists(select 1 from meal_prep_fulfillment_event where id=NEW.resolves_id and subject_id=NEW.subject_id and kind='flag_follow_up')
          then raise exception 'Invalid fulfillment follow-up'; end if;
      end if;
      return NEW;
    end $$;
    create trigger meal_prep_fulfillment_guard before insert on meal_prep_fulfillment_event
      for each row execute function meal_prep_fulfillment_guard();`);
  }
  async down(): Promise<void> {
    this
      .addSql(`lock table meal_prep_fulfillment_event in access exclusive mode;
      do $$ begin if exists(select 1 from meal_prep_fulfillment_event) then
        raise exception 'PR8 rollback refused: preserve fulfillment history; use a forward fix';
      end if; end $$;
      drop table meal_prep_fulfillment_event;
      drop function meal_prep_fulfillment_guard();`);
  }
}
