import { Migration } from '@medusajs/framework/mikro-orm/migrations';

export class Migration20250608201444 extends Migration {

  override async up(): Promise<void> {
    this.addSql(`create table if not exists "chef_event" ("id" text not null, "status" text check ("status" in ('pending', 'confirmed', 'cancelled', 'completed')) not null default 'pending', "requestedDate" timestamptz not null, "requestedTime" text not null, "partySize" integer not null, "eventType" text check ("eventType" in ('cooking_class', 'plated_dinner', 'buffet_style')) not null, "templateProductId" text not null, "locationType" text check ("locationType" in ('customer_location', 'chef_location')) not null, "locationAddress" text not null, "firstName" text not null, "lastName" text not null, "email" text not null, "phone" text not null, "notes" text not null, "totalPrice" numeric not null, "depositPaid" boolean not null default false, "specialRequirements" text not null, "estimatedDuration" integer not null, "raw_totalPrice" jsonb not null, "created_at" timestamptz not null default now(), "updated_at" timestamptz not null default now(), "deleted_at" timestamptz null, constraint "chef_event_pkey" primary key ("id"));`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_chef_event_deleted_at" ON "chef_event" (deleted_at) WHERE deleted_at IS NULL;`);
  }

  override async down(): Promise<void> {
    this.addSql(`drop table if exists "chef_event" cascade;`);
  }

}
