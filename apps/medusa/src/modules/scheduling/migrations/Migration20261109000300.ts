import { Migration } from '@mikro-orm/migrations';

/** Maintenance cutover, after chef-event migrations. No duration recalculation. */
export class Migration20261109000300 extends Migration {
  async up(): Promise<void> {
    this.addSql(`lock table chef_event in access exclusive mode;
      insert into scheduling_reservation(id, owner_id, attempt_id, starts_at, ends_at, state)
      select 'legacy-' || id, id, coalesce("acceptanceToken", 'legacy-' || id), "occupiedStart", "occupiedEnd",
        case when status in ('confirmed','completed') then 'confirmed' else 'held' end
      from chef_event where deleted_at is null and (status in ('confirmed','completed') or "acceptanceToken" is not null);
      alter table chef_event drop constraint chef_event_no_overlap;`);
    // Keep existing event-local policy guards. The old fields are immutable booking snapshots,
    // not an editable reservation authority. Old binaries cannot create new claims after cutover.
    this.addSql(`create function guard_scheduling_event_writer() returns trigger language plpgsql as $$ begin
      if NEW."acceptanceToken" is not null and (TG_OP = 'INSERT' or OLD."acceptanceToken" is null) and
        (NEW."acceptanceExecution" is null or NEW."acceptanceExecution" <> NEW."acceptanceToken") then
        raise exception 'Scheduling cutover: use the current acceptance command';
      end if;
      return NEW;
    end $$;
    create trigger scheduling_event_writer_guard before insert or update on chef_event
      for each row execute function guard_scheduling_event_writer();`);
  }
  async down(): Promise<void> {
    // Rollback must restore the exact protected set; never silently discard an orphan hold.
    this.addSql(`lock table chef_event in access exclusive mode;
      do $$ begin
        if exists(select 1 from scheduling_reservation r where r.deleted_at is null and r.state in ('held','confirmed')
          and not exists(select 1 from chef_event e where e.id=r.owner_id and e.deleted_at is null
            and (e.status in ('confirmed','completed') or e."acceptanceToken" is not null)
            and e."occupiedStart"=r.starts_at and e."occupiedEnd"=r.ends_at)) then
          raise exception 'Scheduling rollback requires reconciliation of protected reservations';
        end if;
      end $$;
      alter table chef_event add constraint chef_event_no_overlap exclude using gist
        (tstzrange("occupiedStart", "occupiedEnd", '[)') with &&)
        where (deleted_at is null and (status in ('confirmed','completed') or "acceptanceToken" is not null));
      drop trigger scheduling_event_writer_guard on chef_event;
      drop function guard_scheduling_event_writer();
`);
  }
}
