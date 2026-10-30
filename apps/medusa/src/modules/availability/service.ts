import type { Context } from '@medusajs/framework/types';
// Medusa 2.7 predates the framework MikroORM re-export.
// eslint-disable-next-line @medusajs/no-mikroorm-direct-import
import type { EntityManager } from '@mikro-orm/knex';
import {
  InjectManager,
  InjectTransactionManager,
  MedusaContext,
  MedusaService,
  MedusaError,
} from '@medusajs/framework/utils';
import { availabilitySettingsSchema, type Settings } from '../../lib/availability/slots';
import { AvailabilitySetting } from './models/availability-setting';

export default class AvailabilityModuleService extends MedusaService({
  AvailabilitySetting,
}) {
  @InjectManager()
  async saveSchedule(input: Settings, @MedusaContext() context: Context<EntityManager> = {}) {
    const parsed = availabilitySettingsSchema.parse(input);
    if (parsed.version === undefined)
      throw new MedusaError(MedusaError.Types.INVALID_DATA, 'Reload Availability before saving.');
    return this.saveSchedule_(parsed, context);
  }

  @InjectTransactionManager()
  protected async saveSchedule_(settings: Settings, @MedusaContext() context: Context<EntityManager> = {}) {
    // A schedule is a complete snapshot. Medusa 2.7's generated update deep-merges
    // JSON, retaining deleted weekdays/exception dates. Replace both maps in one
    // transaction, including on first save, and return exactly the persisted row.
    const [saved] = await context.transactionManager!.execute(
      `insert into availability_setting (id, timezone, weekly, overrides, google_mode, notice_rules, meal_prep, version)
       select 'chef-default', ?, ?::jsonb, ?::jsonb, ?, ?::jsonb, ?::jsonb, 1
       where ? = 0 or exists (select 1 from availability_setting where id = 'chef-default')
       on conflict (id) do update set timezone = excluded.timezone,
         weekly = excluded.weekly, overrides = excluded.overrides,
         google_mode = excluded.google_mode,
         notice_rules = coalesce(excluded.notice_rules, availability_setting.notice_rules),
         meal_prep = case when ? then excluded.meal_prep else availability_setting.meal_prep end,
         version = availability_setting.version + 1,
         updated_at = clock_timestamp(), deleted_at = null
       where availability_setting.version = ?
       returning *`,
      [
        settings.timezone,
        JSON.stringify(settings.weekly),
        JSON.stringify(settings.overrides),
        settings.google_mode,
        settings.notice_rules == null ? null : JSON.stringify(settings.notice_rules),
        settings.meal_prep == null ? null : JSON.stringify(settings.meal_prep),
        settings.version,
        settings.meal_prep !== undefined,
        settings.version,
      ],
    );
    if (!saved)
      throw new MedusaError(
        MedusaError.Types.CONFLICT,
        'Availability changed in another editor. Reload the saved settings before retrying; your draft has been kept.',
      );
    return saved as Settings & { id: string };
  }
}
