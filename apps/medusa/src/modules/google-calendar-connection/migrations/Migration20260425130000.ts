import { Migration } from "@mikro-orm/migrations";

/**
 * Removes ON DELETE CASCADE on the chef_event FKs for sync_map and incident
 * tables. The delete-chef-event workflow now explicitly cancels the linked
 * Google event and purges the artifacts before deleting the chef event row,
 * so cascading would race the async cancellation. Existing rows are
 * preserved; only the constraint behavior changes.
 */
export class Migration20260425130000 extends Migration {
  override async up(): Promise<void> {
    this.addSql(`
      alter table if exists "google_calendar_sync_map"
      drop constraint if exists "google_calendar_sync_map_chefEventId_foreign";
    `);
    this.addSql(`
      alter table if exists "google_calendar_sync_map"
      add constraint "google_calendar_sync_map_chefEventId_foreign"
      foreign key ("chefEventId") references "chef_event" ("id")
      on update cascade on delete no action;
    `);

    this.addSql(`
      alter table if exists "google_calendar_sync_incident"
      drop constraint if exists "google_calendar_sync_incident_chefEventId_foreign";
    `);
    this.addSql(`
      alter table if exists "google_calendar_sync_incident"
      add constraint "google_calendar_sync_incident_chefEventId_foreign"
      foreign key ("chefEventId") references "chef_event" ("id")
      on update cascade on delete no action;
    `);
  }

  override async down(): Promise<void> {
    this.addSql(`
      alter table if exists "google_calendar_sync_map"
      drop constraint if exists "google_calendar_sync_map_chefEventId_foreign";
    `);
    this.addSql(`
      alter table if exists "google_calendar_sync_map"
      add constraint "google_calendar_sync_map_chefEventId_foreign"
      foreign key ("chefEventId") references "chef_event" ("id")
      on update cascade on delete cascade;
    `);

    this.addSql(`
      alter table if exists "google_calendar_sync_incident"
      drop constraint if exists "google_calendar_sync_incident_chefEventId_foreign";
    `);
    this.addSql(`
      alter table if exists "google_calendar_sync_incident"
      add constraint "google_calendar_sync_incident_chefEventId_foreign"
      foreign key ("chefEventId") references "chef_event" ("id")
      on update cascade on delete cascade;
    `);
  }
}
