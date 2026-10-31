import { Migration } from "@mikro-orm/migrations";

/** Test-only financial infrastructure. No legacy commerce or scheduling writes. */
export class Migration20261031000600 extends Migration {
  async up(): Promise<void> {
    this.addSql(`create table meal_prep_billing_quote (
      id text primary key, subject_id text not null references meal_prep_subject(id),
      menu_revision_id text not null, approval_version integer not null,
      chef_actor_id text not null, account_id text not null check(account_id ~ '^acct_[a-zA-Z0-9]+$'),
      currency text not null check(currency='USD'), total_minor integer not null check(total_minor between 1 and 99999999),
      components jsonb not null, policy_fixture text not null check(policy_fixture='test-only-unresolved-D04-D05-D10-D11'),
      test_only boolean not null check(test_only), created_at timestamptz not null default now(),
      unique(id,subject_id), foreign key(menu_revision_id,subject_id) references meal_prep_revision(id,subject_id)
    );`);
    this.addSql(`create table meal_prep_bill (
      id text primary key, subject_id text not null unique references meal_prep_subject(id),
      quote_id text not null unique, created_at timestamptz not null default now(),
      foreign key(quote_id,subject_id) references meal_prep_billing_quote(id,subject_id)
    );`);
    this.addSql(`create table meal_prep_payment_attempt (
      id text primary key, bill_id text not null unique references meal_prep_bill(id),
      customer_id text not null, actor_id text not null,
      authorization_kind text not null check(authorization_kind='pay_exact_quote_once'),
      idempotency_key text not null unique,
      state text not null check(state in ('prepared','unknown','open','processing','requires_action','failed','expired','succeeded')),
      session_id text unique, intent_id text, url text, expires_at bigint,
      dispatch_count integer not null default 0 check(dispatch_count>=0),
      follow_up boolean not null default false,
      created_at timestamptz not null default now(), updated_at timestamptz not null default now()
    );`);
    this.addSql(`create table meal_prep_payment_collection (
      id text primary key, bill_id text not null unique references meal_prep_bill(id),
      attempt_id text not null unique references meal_prep_payment_attempt(id),
      account_id text not null, intent_id text not null, total_minor integer not null,
      currency text not null, created_at timestamptz not null default now(), unique(account_id,intent_id)
    );`);
    this.addSql(`create table meal_prep_payment_event (
      id text primary key, account_id text not null, event_id text not null,
      attempt_id text not null references meal_prep_payment_attempt(id),
      payload_hash text not null, observed_state text not null,
      created_at timestamptz not null default now(), unique(account_id,event_id)
    );`);
    this.addSql(`create table meal_prep_payment_notification (
      id text primary key, bill_id text not null unique references meal_prep_bill(id),
      attempts integer not null default 0 check(attempts>=0),
      state text not null check(state in ('pending','failed','sent','suppressed')),
      delivered_at timestamptz, created_at timestamptz not null default now()
    );`);
    this.addSql(`create table meal_prep_commerce_resource (
      bill_id text not null references meal_prep_bill(id), kind text not null check(kind in ('order','collection')),
      resource_id text unique, created_at timestamptz not null default now(), primary key(bill_id,kind)
    );`);
    this
      .addSql(`create function meal_prep_commerce_resource_guard() returns trigger language plpgsql as $$ begin
      if TG_OP='DELETE' then raise exception 'Commerce history cannot be deleted'; end if;
      if (NEW.bill_id,NEW.kind,NEW.created_at) is distinct from (OLD.bill_id,OLD.kind,OLD.created_at)
        or (OLD.resource_id is not null and NEW.resource_id is distinct from OLD.resource_id)
        then raise exception 'Commerce identity is immutable'; end if;
      return NEW;
    end $$;`);
    this.addSql(
      `create trigger meal_prep_commerce_resource_guard before update or delete on meal_prep_commerce_resource for each row execute function meal_prep_commerce_resource_guard();`,
    );
    this
      .addSql(`create function meal_prep_billing_quote_guard() returns trigger language plpgsql as $$
      declare s meal_prep_subject; b jsonb; r jsonb;
      begin
        select * into s from meal_prep_subject where id=NEW.subject_id for update;
        select body into b from meal_prep_approval_state where subject_id=s.id order by version desc limit 1;
        select body into r from meal_prep_revision where id=NEW.menu_revision_id;
        r := coalesce(r->'change'->'menu',r);
        if s.kind <> 'occurrence' or s.deleted_at is not null or s.version <> NEW.approval_version
          or b->>'confirmedMenuRevisionId' is distinct from NEW.menu_revision_id
          or not exists(select 1 from meal_prep_approval where revision_id=NEW.menu_revision_id and decision='approved')
          or r->'quote'->>'status' is distinct from 'exact_review'
          or r->'quote'->>'currency' is distinct from NEW.currency
          or (r->'quote'->>'totalMinor')::numeric is distinct from NEW.total_minor
          then raise exception 'Billing requires exact current approved menu and price'; end if;
        if jsonb_typeof(NEW.components) <> 'array' or jsonb_array_length(NEW.components)=0
          or exists(select 1 from jsonb_array_elements(NEW.components) c where c->>'kind' not in ('cooking','fulfillment','grocery','other')
            or (c->>'amountMinor')::numeric < 0 or trunc((c->>'amountMinor')::numeric) <> (c->>'amountMinor')::numeric
            or c->>'amountMinor' is null or c->>'provenance' is null or c->>'kind' is null)
          or (select sum((c->>'amountMinor')::numeric) from jsonb_array_elements(NEW.components) c) is distinct from NEW.total_minor::numeric
          then raise exception 'Billing components must sum exactly'; end if;
        return NEW;
      end $$;`);
    this.addSql(
      `create trigger meal_prep_billing_quote_guard before insert on meal_prep_billing_quote for each row execute function meal_prep_billing_quote_guard();`,
    );
    // Even direct/generated approval writers cannot swap a billed menu. D06 remains blocked.
    this
      .addSql(`create function meal_prep_billed_menu_guard() returns trigger language plpgsql as $$
      begin
        if exists(select 1 from meal_prep_bill b join meal_prep_billing_quote q on q.id=b.quote_id
          where b.subject_id=NEW.subject_id and q.menu_revision_id is distinct from NEW.body->>'confirmedMenuRevisionId')
          then raise exception 'D06: billed menu changes require financial reconciliation policy'; end if;
        return NEW;
      end $$;`);
    this.addSql(
      `create trigger meal_prep_billed_menu_guard before insert on meal_prep_approval_state for each row execute function meal_prep_billed_menu_guard();`,
    );
    this
      .addSql(`create function meal_prep_payment_attempt_guard() returns trigger language plpgsql as $$
      begin
        if TG_OP='DELETE' then raise exception 'Payment history cannot be deleted'; end if;
        if (NEW.id,NEW.bill_id,NEW.customer_id,NEW.actor_id,NEW.authorization_kind,NEW.idempotency_key,NEW.created_at)
          is distinct from (OLD.id,OLD.bill_id,OLD.customer_id,OLD.actor_id,OLD.authorization_kind,OLD.idempotency_key,OLD.created_at)
          or (OLD.session_id is not null and NEW.session_id is distinct from OLD.session_id)
          or (OLD.intent_id is not null and NEW.intent_id is distinct from OLD.intent_id)
          or (OLD.state='succeeded' and NEW.state<>'succeeded') or NEW.dispatch_count<OLD.dispatch_count
          then raise exception 'Payment identity and success are immutable'; end if;
        return NEW;
      end $$;`);
    this.addSql(
      `create trigger meal_prep_payment_attempt_guard before update or delete on meal_prep_payment_attempt for each row execute function meal_prep_payment_attempt_guard();`,
    );
    this
      .addSql(`create function meal_prep_collection_guard() returns trigger language plpgsql as $$
      begin
        if not exists(select 1 from meal_prep_payment_attempt a join meal_prep_bill b on b.id=a.bill_id
          join meal_prep_billing_quote q on q.id=b.quote_id where a.id=NEW.attempt_id and b.id=NEW.bill_id
          and a.state='succeeded' and a.intent_id=NEW.intent_id and q.account_id=NEW.account_id
          and q.total_minor=NEW.total_minor and q.currency=NEW.currency)
          then raise exception 'Collection must match reconciled attempt'; end if;
        return NEW;
      end $$;`);
    this.addSql(
      `create trigger meal_prep_collection_guard before insert on meal_prep_payment_collection for each row execute function meal_prep_collection_guard();`,
    );
    for (const table of [
      "billing_quote",
      "bill",
      "payment_collection",
      "payment_event",
    ])
      this.addSql(
        `create trigger meal_prep_${table}_immutable before update or delete on meal_prep_${table} for each row execute function meal_prep_immutable();`,
      );
  }
  async down(): Promise<void> {
    this.addSql(`lock table meal_prep_billing_quote in access exclusive mode;`);
    this.addSql(
      `do $$ begin if exists(select 1 from meal_prep_billing_quote) then raise exception 'Billing rollback refused: preserve financial history'; end if; end $$;`,
    );
    this.addSql(
      `drop trigger meal_prep_billed_menu_guard on meal_prep_approval_state;`,
    );
    for (const t of [
      "commerce_resource",
      "payment_notification",
      "payment_event",
      "payment_collection",
      "payment_attempt",
      "bill",
      "billing_quote",
    ])
      this.addSql(`drop table meal_prep_${t};`);
    for (const f of [
      "commerce_resource_guard",
      "billed_menu_guard",
      "billing_quote_guard",
      "payment_attempt_guard",
      "collection_guard",
    ])
      this.addSql(`drop function meal_prep_${f}();`);
  }
}
