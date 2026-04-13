import { Migration } from '@mikro-orm/migrations';

/**
 * v1.1: Dynamic experience types — drop workflow_event_type; relax chef_event.eventType to free text.
 */
export class Migration20260413120000 extends Migration {
  override async up(): Promise<void> {
    this.addSql(`alter table if exists "experience_type" drop column if exists "workflow_event_type";`);

    this.addSql(`alter table if exists "chef_event" drop constraint if exists "chef_event_eventType_check";`);
    this.addSql(`alter table if exists "chef_event" drop constraint if exists "chef_event_eventtype_check";`);
  }

  override async down(): Promise<void> {
    this.addSql(`
      alter table if exists "experience_type" add column if not exists "workflow_event_type" text check ("workflow_event_type" in ('cooking_class','plated_dinner','buffet_style')) not null default 'plated_dinner';
    `);

    this.addSql(`
      alter table if exists "chef_event" add constraint "chef_event_eventType_check" check ("eventType" in ('cooking_class', 'plated_dinner', 'buffet_style'));
    `);
  }
}
