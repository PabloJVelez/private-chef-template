import { Migration } from "@mikro-orm/migrations";

export class Migration20260425120000 extends Migration {
  override async up(): Promise<void> {
    this.addSql(`
      create table if not exists "google_calendar_sync_incident" (
        "id" text not null,
        "connectionId" text not null,
        "chefEventId" text not null,
        "googleEventId" text not null,
        "incidentType" text check ("incidentType" in ('google_cancelled_ignored')) not null default 'google_cancelled_ignored',
        "status" text check ("status" in ('pending','approved','denied')) not null default 'pending',
        "googleUpdatedAt" timestamptz null,
        "payload" jsonb null,
        "resolvedAt" timestamptz null,
        "resolvedBy" text null,
        "created_at" timestamptz not null default now(),
        "updated_at" timestamptz not null default now(),
        "deleted_at" timestamptz null,
        constraint "google_calendar_sync_incident_pkey" primary key ("id"),
        constraint "google_calendar_sync_incident_connectionId_foreign" foreign key ("connectionId") references "google_calendar_connection" ("id") on update cascade on delete cascade,
        constraint "google_calendar_sync_incident_chefEventId_foreign" foreign key ("chefEventId") references "chef_event" ("id") on update cascade on delete cascade
      );
    `);

    this.addSql(`
      create index if not exists "IDX_google_incident_connection_status"
      on "google_calendar_sync_incident" ("connectionId", "status")
      where "deleted_at" is null;
    `);
  }

  override async down(): Promise<void> {
    this.addSql(`drop table if exists "google_calendar_sync_incident" cascade;`);
  }
}
