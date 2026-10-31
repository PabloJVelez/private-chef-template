import { Migration } from "@mikro-orm/migrations";

/** Additive test-only consent/worker infrastructure. No timing or production activation. */
export class Migration20261031000700 extends Migration {
  async up(): Promise<void> {
    this.addSql(`create table meal_prep_method_setup (
      id text primary key, bill_id text not null unique references meal_prep_bill(id),
      customer_id text not null, chef_id text not null, account_id text not null,
      actor_id text not null, idempotency_key text not null unique,
      provider text, provider_customer_id text, session_id text, payment_method_id text, setup_intent_id text,
      url text, state text not null check(state in ('prepared','pending','ready')),
      created_at timestamptz not null default now(), unique(account_id,session_id)
    );
    create table meal_prep_method_invalidation (
      setup_id text primary key references meal_prep_method_setup(id), actor_id text not null,
      created_at timestamptz not null default now()
    );
    create table meal_prep_autopay_consent (
      id text primary key, bill_id text not null unique references meal_prep_bill(id),
      quote_id text not null references meal_prep_billing_quote(id), setup_id text not null references meal_prep_method_setup(id),
      customer_id text not null, actor_id text not null, approval_version integer not null,
      total_minor integer not null, currency text not null, account_id text not null,
      authorization_kind text not null check(authorization_kind='charge_exact_occurrence_once'),
      terms_version text not null check(terms_version='test-occurrence-consent-v1'),
      created_at timestamptz not null default now()
    );
    create table meal_prep_autopay_revocation (
      consent_id text primary key references meal_prep_autopay_consent(id), actor_id text not null,
      created_at timestamptz not null default now()
    );
    create table meal_prep_payment_trigger (
      id text primary key, bill_id text not null references meal_prep_bill(id), quote_id text not null references meal_prep_billing_quote(id),
      kind text not null check(kind in ('autopay','unpaid_reminder')), trigger_at timestamptz not null,
      policy_reference text not null, approval_reference text not null, actor_id text not null,
      fixture text not null check(fixture='test-only-unresolved-D01'), created_at timestamptz not null default now(), unique(bill_id,kind), unique(id,bill_id)
    );
    create table meal_prep_autopay_attempt (
      id text primary key, bill_id text not null unique references meal_prep_bill(id),
      consent_id text not null unique references meal_prep_autopay_consent(id),
      trigger_id text not null unique references meal_prep_payment_trigger(id), idempotency_key text not null unique,
      state text not null check(state in ('prepared','unknown','processing','requires_action','failed','succeeded','canceled')),
      intent_id text, dispatch_count integer not null default 0 check(dispatch_count>=0),
      follow_up boolean not null default false, created_at timestamptz not null default now(),
      dispatched_at timestamptz, updated_at timestamptz not null default now()
    );
    create table meal_prep_autopay_event (
      id text primary key, account_id text not null, event_id text not null,
      attempt_id text not null references meal_prep_autopay_attempt(id), payload_hash text not null,
      observed_state text not null, created_at timestamptz not null default now(), unique(account_id,event_id)
    );
    create table meal_prep_notification_intent (
      id text primary key, bill_id text not null references meal_prep_bill(id),
      kind text not null check(kind in ('unpaid_reminder','autopay_fallback')),
      trigger_id text references meal_prep_payment_trigger(id),
      state text not null check(state in ('pending','inflight','sent','suppressed')),
      claim_id text, lease_until timestamptz, created_at timestamptz not null default now(), unique(bill_id,kind),
      foreign key(trigger_id,bill_id) references meal_prep_payment_trigger(id,bill_id),
      check((kind='unpaid_reminder' and trigger_id is not null) or (kind='autopay_fallback' and trigger_id is null))
    );
    create table meal_prep_notification_dispatch (
      id text primary key, notification_id text not null references meal_prep_notification_intent(id),
      created_at timestamptz not null default now()
    );
    create table meal_prep_notification_result (
      dispatch_id text primary key references meal_prep_notification_dispatch(id),
      outcome text not null check(outcome in ('sent','retry','suppressed')),
      created_at timestamptz not null default now()
    );`);
    for (const t of [
      "autopay_consent",
      "autopay_revocation",
      "method_invalidation",
      "payment_trigger",
      "autopay_event",
      "notification_dispatch",
      "notification_result",
    ])
      this.addSql(
        `create trigger meal_prep_${t}_immutable before update or delete on meal_prep_${t} for each row execute function meal_prep_immutable();`,
      );
    this
      .addSql(`create function meal_prep_method_setup_guard() returns trigger language plpgsql as $$ begin
      if TG_OP='DELETE' then raise exception 'Saved method history is immutable'; end if;
      if (NEW.id,NEW.bill_id,NEW.customer_id,NEW.chef_id,NEW.account_id,NEW.actor_id,NEW.idempotency_key,NEW.created_at)
        is distinct from (OLD.id,OLD.bill_id,OLD.customer_id,OLD.chef_id,OLD.account_id,OLD.actor_id,OLD.idempotency_key,OLD.created_at)
        or (OLD.session_id is not null and (NEW.session_id,NEW.provider_customer_id,NEW.provider) is distinct from (OLD.session_id,OLD.provider_customer_id,OLD.provider))
        or (OLD.state='ready' and NEW is distinct from OLD) then raise exception 'Saved method identity is immutable'; end if;
      return NEW; end $$;
      create trigger meal_prep_method_setup_guard before update or delete on meal_prep_method_setup for each row execute function meal_prep_method_setup_guard();
      create function meal_prep_autopay_consent_guard() returns trigger language plpgsql as $$ begin
        if not exists(select 1 from meal_prep_bill b join meal_prep_billing_quote q on q.id=b.quote_id
          join meal_prep_subject s on s.id=b.subject_id join meal_prep_method_setup m on m.id=NEW.setup_id
          where b.id=NEW.bill_id and q.id=NEW.quote_id and q.total_minor=NEW.total_minor and q.currency=NEW.currency
          and q.account_id=NEW.account_id and s.customer_id=NEW.customer_id and s.version=NEW.approval_version
          and m.bill_id=b.id and m.customer_id=s.customer_id and m.chef_id=s.chef_id and m.account_id=q.account_id
          and m.state='ready' and m.payment_method_id is not null and not exists(select 1 from meal_prep_method_invalidation where setup_id=m.id))
          then raise exception 'Consent requires exact approved price and verified saved method'; end if;
        return NEW; end $$;
      create trigger meal_prep_autopay_consent_guard before insert on meal_prep_autopay_consent for each row execute function meal_prep_autopay_consent_guard();
      create function meal_prep_autopay_attempt_guard() returns trigger language plpgsql as $$ begin
        if TG_OP='DELETE' then raise exception 'Autopay history is immutable'; end if;
        if (NEW.id,NEW.bill_id,NEW.consent_id,NEW.trigger_id,NEW.idempotency_key,NEW.created_at) is distinct from
          (OLD.id,OLD.bill_id,OLD.consent_id,OLD.trigger_id,OLD.idempotency_key,OLD.created_at)
          or (OLD.intent_id is not null and NEW.intent_id is distinct from OLD.intent_id)
          or (OLD.state in ('succeeded','canceled') and NEW.state<>OLD.state)
          or (OLD.dispatched_at is not null and NEW.dispatched_at is distinct from OLD.dispatched_at)
          or NEW.dispatch_count<OLD.dispatch_count then raise exception 'Autopay identity and terminal state are immutable'; end if;
        return NEW; end $$;
      create trigger meal_prep_autopay_attempt_guard before update or delete on meal_prep_autopay_attempt for each row execute function meal_prep_autopay_attempt_guard();`);
    this
      .addSql(`create function meal_prep_notification_intent_guard() returns trigger language plpgsql as $$ begin
      if TG_OP='DELETE' then raise exception 'Notification history is immutable'; end if;
      if (NEW.id,NEW.bill_id,NEW.kind,NEW.trigger_id,NEW.created_at) is distinct from (OLD.id,OLD.bill_id,OLD.kind,OLD.trigger_id,OLD.created_at)
        or (OLD.state in ('sent','suppressed') and NEW.state<>OLD.state)
        then raise exception 'Notification identity and terminal state are immutable'; end if;
      return NEW; end $$;
      create trigger meal_prep_notification_intent_guard before update or delete on meal_prep_notification_intent for each row execute function meal_prep_notification_intent_guard();`);
    // Both paths retain one shared collection ledger and one obligation. Existing rows are untouched.
    this
      .addSql(`alter table meal_prep_payment_collection alter column attempt_id drop not null;
      alter table meal_prep_payment_collection add column autopay_attempt_id text unique references meal_prep_autopay_attempt(id);
      alter table meal_prep_payment_collection add constraint meal_prep_one_collection_source check(num_nonnulls(attempt_id,autopay_attempt_id)=1);`);
    this
      .addSql(`create or replace function meal_prep_collection_guard() returns trigger language plpgsql as $$ begin
      if not exists(select 1 from meal_prep_bill b join meal_prep_billing_quote q on q.id=b.quote_id
        where b.id=NEW.bill_id and q.account_id=NEW.account_id and q.total_minor=NEW.total_minor and q.currency=NEW.currency
        and (exists(select 1 from meal_prep_payment_attempt a where a.id=NEW.attempt_id and a.bill_id=b.id and a.state='succeeded' and a.intent_id=NEW.intent_id)
          or exists(select 1 from meal_prep_autopay_attempt a where a.id=NEW.autopay_attempt_id and a.bill_id=b.id and a.state='succeeded' and a.intent_id=NEW.intent_id)))
        then raise exception 'Collection must match reconciled attempt'; end if;
      return NEW; end $$;`);
    // Direct writers also serialize manual/autopay entry using the same occurrence lock.
    this
      .addSql(`create function meal_prep_payment_exclusion_guard() returns trigger language plpgsql as $$ declare sid text; begin
      select subject_id into sid from meal_prep_bill where id=NEW.bill_id;
      perform pg_advisory_xact_lock(hashtextextended('meal-prep-approval:' || sid,0));
      if exists(select 1 from meal_prep_payment_collection where bill_id=NEW.bill_id) then raise exception 'Already collected'; end if;
      if TG_TABLE_NAME='meal_prep_payment_attempt' then
        if exists(select 1 from meal_prep_autopay_attempt where bill_id=NEW.bill_id and state<>'canceled')
          then raise exception 'Autopay reconciliation required'; end if;
      else
        if exists(select 1 from meal_prep_payment_attempt where bill_id=NEW.bill_id)
          then raise exception 'Manual payment reconciliation required'; end if;
        if not exists(select 1 from meal_prep_autopay_consent c join meal_prep_payment_trigger t on t.id=NEW.trigger_id
          where c.id=NEW.consent_id and c.bill_id=NEW.bill_id and t.bill_id=c.bill_id and t.quote_id=c.quote_id and t.kind='autopay'
          and not exists(select 1 from meal_prep_autopay_revocation where consent_id=c.id)
          and not exists(select 1 from meal_prep_method_invalidation where setup_id=c.setup_id))
          then raise exception 'Valid occurrence consent and trigger required'; end if;
      end if; return NEW; end $$;
      create trigger meal_prep_manual_exclusion before insert on meal_prep_payment_attempt for each row execute function meal_prep_payment_exclusion_guard();
      create trigger meal_prep_auto_exclusion before insert on meal_prep_autopay_attempt for each row execute function meal_prep_payment_exclusion_guard();`);
  }
  async down(): Promise<void> {
    this
      .addSql(`lock table meal_prep_method_setup,meal_prep_payment_trigger in access exclusive mode;
      do $$ begin if exists(select 1 from meal_prep_method_setup) or exists(select 1 from meal_prep_payment_trigger)
        then raise exception 'Autopay rollback refused: preserve consent and dispatch history'; end if; end $$;
      drop trigger meal_prep_manual_exclusion on meal_prep_payment_attempt;
      drop trigger meal_prep_auto_exclusion on meal_prep_autopay_attempt;
      drop function meal_prep_payment_exclusion_guard();
      alter table meal_prep_payment_collection drop constraint meal_prep_one_collection_source;
      alter table meal_prep_payment_collection drop column autopay_attempt_id;
      alter table meal_prep_payment_collection alter column attempt_id set not null;`);
    this
      .addSql(`create or replace function meal_prep_collection_guard() returns trigger language plpgsql as $$ begin
      if not exists(select 1 from meal_prep_payment_attempt a join meal_prep_bill b on b.id=a.bill_id
        join meal_prep_billing_quote q on q.id=b.quote_id where a.id=NEW.attempt_id and b.id=NEW.bill_id
        and a.state='succeeded' and a.intent_id=NEW.intent_id and q.account_id=NEW.account_id
        and q.total_minor=NEW.total_minor and q.currency=NEW.currency) then raise exception 'Collection must match reconciled attempt'; end if;
      return NEW; end $$;`);
    for (const t of [
      "notification_result",
      "notification_dispatch",
      "notification_intent",
      "autopay_event",
      "autopay_attempt",
      "payment_trigger",
      "autopay_revocation",
      "autopay_consent",
      "method_invalidation",
      "method_setup",
    ])
      this.addSql(`drop table meal_prep_${t};`);
    for (const f of [
      "notification_intent_guard",
      "autopay_attempt_guard",
      "autopay_consent_guard",
      "method_setup_guard",
    ])
      this.addSql(`drop function meal_prep_${f}();`);
  }
}
