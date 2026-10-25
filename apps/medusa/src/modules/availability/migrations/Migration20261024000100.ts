import { Migration } from '@mikro-orm/migrations';

export class Migration20261024000100 extends Migration {
  async up(): Promise<void> {
    this.addSql('alter table availability_setting add column if not exists notice_rules jsonb null;');
    // Preserve different saved lead times, including inactive experiences, without
    // making a selected-experience policy apply to future experiences implicitly.
    this.addSql(`do $$ begin
      if to_regclass('experience_type') is null then
        update availability_setting set notice_rules = '[]'::jsonb where notice_rules is null;
      else
      update availability_setting set notice_rules = coalesce((
      select jsonb_agg(jsonb_build_object('enabled', true, 'days', days,
        'scope', 'selected', 'experience_ids', ids) order by days)
      from (select advance_notice_days as days, jsonb_agg(id order by id) as ids
        from experience_type where deleted_at is null and requires_advance_notice = true
        and advance_notice_days > 0 group by advance_notice_days) rules
    ), '[]'::jsonb) where notice_rules is null;
      end if;
    end $$;`);
  }
  async down(): Promise<void> {
    this.addSql('alter table availability_setting drop column if exists notice_rules;');
  }
}
