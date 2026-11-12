import { Migration } from '@medusajs/framework/mikro-orm/migrations';

/** Align the legacy NOT NULL column with the existing nullable DML/API contract.
 * The target ORM explicitly writes null for omitted nullable JSON fields.
 */
export class Migration20261112000100 extends Migration {
  async up(): Promise<void> {
    this.addSql('alter table "experience_type" alter column "available_time_slots" drop not null;');
  }
  async down(): Promise<void> {
    // PostgreSQL refuses rollback if nullable values exist; never erase or rewrite saved settings.
    this.addSql('alter table "experience_type" alter column "available_time_slots" set not null;');
  }
}
