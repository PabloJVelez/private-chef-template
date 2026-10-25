import { Migration } from '@mikro-orm/migrations';
export class Migration20261015000300 extends Migration {
  async up(): Promise<void> {
    // These chef-owned fields were historically added by other modules. Ensure fresh installs
    // work regardless of module migration order; leave them intact on rollback.
    this.addSql(
      `alter table chef_event add column if not exists "timeZone" text not null default 'America/Chicago', add column if not exists experience_type_id text null;`,
    );
    this.addSql(
      `alter table chef_event add column "occupiedStart" timestamptz null, add column "occupiedEnd" timestamptz null, add column "availabilitySnapshot" jsonb null, add column "acceptanceToken" text null;`,
    );
    // Do not guess legacy durations. This deliberately stops for missing durations or overlapping bookings.
    this.addSql(
      `do $$ begin if exists(select 1 from chef_event where status in ('confirmed','completed') and deleted_at is null and ("estimatedDuration" is null or "estimatedDuration" <= 0)) then raise exception 'Availability migration: audit legacy booking durations before retrying'; end if; end $$;`,
    );
    this.addSql(
      `update chef_event set "occupiedStart" = "requestedDate", "occupiedEnd" = "requestedDate" + "estimatedDuration" * interval '1 minute', "availabilitySnapshot" = jsonb_build_object('legacy', true, 'duration_minutes', "estimatedDuration", 'timezone', "timeZone", 'preparation_minutes', 0, 'travel_minutes', 0, 'cleanup_minutes', 0) where status in ('confirmed','completed') and deleted_at is null;`,
    );
    this.addSql(
      `alter table chef_event add constraint chef_event_occupied_valid check (deleted_at is not null or (status not in ('confirmed','completed') and "acceptanceToken" is null) or ("occupiedStart" is not null and "occupiedEnd" is not null and "occupiedEnd" > "occupiedStart")), add constraint chef_event_no_overlap exclude using gist (tstzrange("occupiedStart", "occupiedEnd", '[)') with &&) where (deleted_at is null and (status in ('confirmed','completed') or "acceptanceToken" is not null));`,
    );
    this.addSql(`create function guard_chef_availability() returns trigger language plpgsql as $$ begin
    if TG_OP = 'DELETE' then
      if OLD."acceptanceToken" is not null then raise exception 'Acceptance is in progress'; end if;
      return OLD;
    end if;
    if TG_OP = 'UPDATE' and OLD."acceptanceToken" is not null and
      (to_jsonb(NEW) - array['updated_at','acceptanceToken','status','productId','acceptedAt','acceptedBy','chefNotes','sendAcceptanceEmail','occupiedStart','occupiedEnd','availabilitySnapshot','emailHistory','lastEmailSentAt']) is distinct from
      (to_jsonb(OLD) - array['updated_at','acceptanceToken','status','productId','acceptedAt','acceptedBy','chefNotes','sendAcceptanceEmail','occupiedStart','occupiedEnd','availabilitySnapshot','emailHistory','lastEmailSentAt']) then
      raise exception 'Acceptance is in progress; event details cannot change';
    end if;
    if TG_OP = 'UPDATE' and OLD.status in ('confirmed','completed') then
      if NEW.status = 'pending' then raise exception 'Accepted bookings cannot become pending'; end if;
      if NEW."occupiedStart" is distinct from OLD."occupiedStart" or NEW."occupiedEnd" is distinct from OLD."occupiedEnd" or NEW."availabilitySnapshot" is distinct from OLD."availabilitySnapshot" then raise exception 'Accepted availability snapshots are immutable'; end if;
    end if;
    if TG_OP = 'UPDATE'  and (OLD."acceptanceToken" is not null or OLD.status in ('confirmed','completed')) then
      if NEW."requestedDate" is distinct from OLD."requestedDate" or NEW."requestedTime" is distinct from OLD."requestedTime" or NEW."timeZone" is distinct from OLD."timeZone" or NEW."estimatedDuration" is distinct from OLD."estimatedDuration" or NEW.experience_type_id is distinct from OLD.experience_type_id then
        raise exception 'Accepted or accepting events cannot be rescheduled in v1; cancel and create a new request';
      end if;
      if OLD."acceptanceToken" is not null and (NEW.status not in ('pending','confirmed') or NEW.deleted_at is distinct from OLD.deleted_at) then raise exception 'Acceptance is in progress'; end if;
    end if;
    if NEW.status in ('confirmed','completed') and (TG_OP = 'INSERT' or (OLD.status not in ('confirmed','completed') and OLD."acceptanceToken" is null)) then raise exception 'Use the acceptance workflow to confirm an event'; end if;
    return NEW;
  end $$;
  create trigger chef_availability_guard before insert or update or delete on chef_event for each row execute function guard_chef_availability();`);
  }
  async down(): Promise<void> {
    this.addSql(
      'drop trigger if exists chef_availability_guard on chef_event; drop function if exists guard_chef_availability(); alter table chef_event drop constraint chef_event_no_overlap, drop constraint chef_event_occupied_valid, drop column "occupiedStart", drop column "occupiedEnd", drop column "availabilitySnapshot", drop column "acceptanceToken";',
    );
  }
}
