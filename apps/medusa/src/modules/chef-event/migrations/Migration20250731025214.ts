import { Migration } from '@medusajs/framework/mikro-orm/migrations';

export class Migration20250731025214 extends Migration {

  override async up(): Promise<void> {
    this.addSql(`alter table if exists "chef_event" add column if not exists "productId" text null, add column if not exists "acceptedAt" timestamptz null, add column if not exists "acceptedBy" text null, add column if not exists "rejectionReason" text null, add column if not exists "chefNotes" text null, add column if not exists "sendAcceptanceEmail" boolean not null default true, add column if not exists "emailHistory" jsonb null, add column if not exists "lastEmailSentAt" timestamptz null, add column if not exists "customEmailRecipients" jsonb null;`);
    this.addSql(`alter table if exists "chef_event" alter column "estimatedDuration" type integer using ("estimatedDuration"::integer);`);
    this.addSql(`alter table if exists "chef_event" alter column "estimatedDuration" drop not null;`);
  }

  override async down(): Promise<void> {
    this.addSql(`alter table if exists "chef_event" drop column if exists "productId", drop column if exists "acceptedAt", drop column if exists "acceptedBy", drop column if exists "rejectionReason", drop column if exists "chefNotes", drop column if exists "sendAcceptanceEmail", drop column if exists "emailHistory", drop column if exists "lastEmailSentAt", drop column if exists "customEmailRecipients";`);

    this.addSql(`alter table if exists "chef_event" alter column "estimatedDuration" type integer using ("estimatedDuration"::integer);`);
    this.addSql(`alter table if exists "chef_event" alter column "estimatedDuration" set not null;`);
  }

}
