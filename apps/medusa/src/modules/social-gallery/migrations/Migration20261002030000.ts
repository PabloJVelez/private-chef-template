import { Migration } from '@mikro-orm/migrations';

export class Migration20261002030000 extends Migration {
  override async up(): Promise<void> {
    this.addSql(`alter table if exists "social_gallery_post" alter column "media_url" drop not null;`);
  }

  override async down(): Promise<void> {
    this.addSql(`alter table if exists "social_gallery_post" alter column "media_url" set not null;`);
  }
}
