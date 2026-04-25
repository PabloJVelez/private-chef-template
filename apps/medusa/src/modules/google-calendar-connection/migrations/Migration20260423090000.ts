import { Migration } from "@mikro-orm/migrations";

export class Migration20260423090000 extends Migration {
  override async up(): Promise<void> {
    this.addSql(`
      create table if not exists "google_calendar_connection" (
        "id" text not null,
        "adminUserId" text not null,
        "calendarId" text not null default 'primary',
        "scope" text not null,
        "accessTokenEnc" text null,
        "refreshTokenEnc" text null,
        "accessTokenExpiresAt" timestamptz null,
        "watchChannelId" text null,
        "watchResourceId" text null,
        "watchExpiresAt" timestamptz null,
        "nextSyncToken" text null,
        "status" text check ("status" in ('not_connected','active','reauthorization_required','sync_error')) not null default 'not_connected',
        "lastSyncedAt" timestamptz null,
        "lastSyncError" text null,
        "created_at" timestamptz not null default now(),
        "updated_at" timestamptz not null default now(),
        "deleted_at" timestamptz null,
        constraint "google_calendar_connection_pkey" primary key ("id")
      );
    `);

    this.addSql(`
      create unique index if not exists "IDX_google_calendar_connection_admin_calendar_active"
      on "google_calendar_connection" ("adminUserId", "calendarId")
      where "deleted_at" is null;
    `);

    this.addSql(`
      create table if not exists "google_calendar_sync_map" (
        "id" text not null,
        "connectionId" text not null,
        "chefEventId" text not null,
        "googleEventId" text not null,
        "googleEtag" text null,
        "googleUpdatedAt" timestamptz null,
        "lastAppHash" text null,
        "lastPushedAt" timestamptz null,
        "lastPulledAt" timestamptz null,
        "syncState" text check ("syncState" in ('linked','cancelled_in_app','cancelled_in_google','sync_error')) not null default 'linked',
        "created_at" timestamptz not null default now(),
        "updated_at" timestamptz not null default now(),
        "deleted_at" timestamptz null,
        constraint "google_calendar_sync_map_pkey" primary key ("id"),
        constraint "google_calendar_sync_map_connectionId_foreign" foreign key ("connectionId") references "google_calendar_connection" ("id") on update cascade on delete cascade,
        constraint "google_calendar_sync_map_chefEventId_foreign" foreign key ("chefEventId") references "chef_event" ("id") on update cascade on delete cascade
      );
    `);

    this.addSql(`
      create unique index if not exists "IDX_google_sync_map_connection_chef_event"
      on "google_calendar_sync_map" ("connectionId", "chefEventId")
      where "deleted_at" is null;
    `);

    this.addSql(`
      create unique index if not exists "IDX_google_sync_map_connection_google_event"
      on "google_calendar_sync_map" ("connectionId", "googleEventId")
      where "deleted_at" is null;
    `);

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

    this.addSql(
      `alter table if exists "chef_event" add column if not exists "timeZone" text not null default 'America/Chicago';`,
    );
  }

  override async down(): Promise<void> {
    this.addSql(
      `alter table if exists "chef_event" drop column if exists "timeZone";`,
    );
    this.addSql(`drop table if exists "google_calendar_sync_incident" cascade;`);
    this.addSql(`drop table if exists "google_calendar_sync_map" cascade;`);
    this.addSql(`drop table if exists "google_calendar_connection" cascade;`);
  }
}
