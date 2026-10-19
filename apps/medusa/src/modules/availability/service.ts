import type { Context } from '@medusajs/framework/types';
// Medusa 2.7 predates the framework MikroORM re-export.
// eslint-disable-next-line @medusajs/no-mikroorm-direct-import
import type { EntityManager } from '@mikro-orm/knex';
import { InjectManager, InjectTransactionManager, MedusaContext, MedusaService } from '@medusajs/framework/utils';
import { availabilitySettingsSchema, type Settings } from '../../lib/availability/slots';
import { AvailabilitySetting } from './models/availability-setting';

export default class AvailabilityModuleService extends MedusaService({ AvailabilitySetting }) {
  @InjectManager()
  async saveSchedule(input: Settings, @MedusaContext() context: Context<EntityManager> = {}) {
    return this.saveSchedule_(availabilitySettingsSchema.parse(input), context);
  }

  @InjectTransactionManager()
  protected async saveSchedule_(settings: Settings, @MedusaContext() context: Context<EntityManager> = {}) {
    // A schedule is a complete snapshot. Medusa 2.7's generated update deep-merges
    // JSON, retaining deleted weekdays/exception dates. Replace both maps in one
    // transaction, including on first save, and return exactly the persisted row.
    const [saved] = await context.transactionManager!.execute(
      `insert into availability_setting (id, timezone, weekly, overrides, google_mode)
       values ('chef-default', ?, ?::jsonb, ?::jsonb, ?)
       on conflict (id) do update set timezone = excluded.timezone,
         weekly = excluded.weekly, overrides = excluded.overrides,
         google_mode = excluded.google_mode, updated_at = now(), deleted_at = null
       returning *`,
      [settings.timezone, JSON.stringify(settings.weekly), JSON.stringify(settings.overrides), settings.google_mode],
    );
    return saved as Settings & { id: string };
  }
}
