import { Migration } from "@mikro-orm/migrations";

export class Migration20261109000400 extends Migration {
  async up(): Promise<void> {
    // Existing aborted attempts are not proof that their cross-module cleanup completed.
    this.addSql(
      "alter table chef_event_acceptance_attempt add column cleanup_completed_at timestamptz null;",
    );
  }
  async down(): Promise<void> {
    this.addSql(
      "alter table chef_event_acceptance_attempt drop column cleanup_completed_at;",
    );
  }
}
