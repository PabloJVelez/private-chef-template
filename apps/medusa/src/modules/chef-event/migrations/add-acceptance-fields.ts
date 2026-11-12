import { Migration } from '@medusajs/framework/mikro-orm/migrations';

export class Migration20250608201445 extends Migration {

  override async up(): Promise<void> {
    this.addSql(`ALTER TABLE "chef_event" ADD COLUMN IF NOT EXISTS "productId" text null;`);
    this.addSql(`ALTER TABLE "chef_event" ADD COLUMN IF NOT EXISTS "acceptedAt" timestamptz null;`);
    this.addSql(`ALTER TABLE "chef_event" ADD COLUMN IF NOT EXISTS "acceptedBy" text null;`);
    this.addSql(`ALTER TABLE "chef_event" ADD COLUMN IF NOT EXISTS "rejectionReason" text null;`);
    this.addSql(`ALTER TABLE "chef_event" ADD COLUMN IF NOT EXISTS "chefNotes" text null;`);
  }

  override async down(): Promise<void> {
    this.addSql(`ALTER TABLE "chef_event" DROP COLUMN IF EXISTS "productId";`);
    this.addSql(`ALTER TABLE "chef_event" DROP COLUMN IF EXISTS "acceptedAt";`);
    this.addSql(`ALTER TABLE "chef_event" DROP COLUMN IF EXISTS "acceptedBy";`);
    this.addSql(`ALTER TABLE "chef_event" DROP COLUMN IF EXISTS "rejectionReason";`);
    this.addSql(`ALTER TABLE "chef_event" DROP COLUMN IF EXISTS "chefNotes";`);
  }

} 