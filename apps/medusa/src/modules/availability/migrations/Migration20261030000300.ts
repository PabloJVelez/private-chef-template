import { Migration } from '@mikro-orm/migrations';

export class Migration20261030000300 extends Migration {
  async up(): Promise<void> {
    this.addSql(`alter table availability_setting
      add column version integer not null default 0 check (version >= 0),
      add column meal_prep jsonb null check (meal_prep is null or jsonb_typeof(meal_prep) = 'object');`);
    // Even generated CRUD/direct updates invalidate editor versions. The same row
    // lock continues to serialize saves with PR 2's actual-time replacement.
    this.addSql(`create function availability_bump_version() returns trigger language plpgsql as $$
      begin new.version := old.version + 1; return new; end $$;`);
    this.addSql(`create trigger availability_version before update on availability_setting
      for each row execute function availability_bump_version();`);
  }
  async down(): Promise<void> {
    // Never silently discard saved drafts on downgrade.
    this.addSql(`lock table availability_setting in access exclusive mode;`);
    this.addSql(`do $$ begin
      if exists (select 1 from availability_setting where meal_prep is not null) then
        raise exception 'Meal prep setup exists; preserve it with a reviewed forward migration';
      end if;
    end $$;`);
    this.addSql('drop trigger availability_version on availability_setting;');
    this.addSql('drop function availability_bump_version();');
    this.addSql('alter table availability_setting drop column meal_prep, drop column version;');
  }
}
