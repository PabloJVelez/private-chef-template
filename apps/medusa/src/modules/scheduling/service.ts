import type { Context } from '@medusajs/framework/types';
import {
  InjectManager,
  InjectTransactionManager,
  MedusaContext,
  MedusaError,
  MedusaService,
} from '@medusajs/framework/utils';
import type { EntityManager } from '@mikro-orm/knex';
import { Reservation } from './models/reservation';

type Owner = { id: string; ownerId: string; attemptId: string };
type Acquire = Owner & { start: string; end: string };

function interval(start: string, end: string) {
  const from = new Date(start),
    to = new Date(end);
  if (!Number.isFinite(from.getTime()) || !Number.isFinite(to.getTime()) || from >= to)
    throw new MedusaError(MedusaError.Types.INVALID_DATA, 'Reservation requires a finite ordered interval.');
  return [from.toISOString(), to.toISOString()];
}

/** Internal write owner. Private Events authorizes commands; no public mutation route. */
class SchedulingModuleService extends MedusaService({ Reservation }) {
  @InjectManager()
  async acquire(input: Acquire, @MedusaContext() context: Context<EntityManager> = {}) {
    return this.acquire_(input, context);
  }

  @InjectTransactionManager()
  protected async acquire_(input: Acquire, @MedusaContext() context: Context<EntityManager> = {}) {
    const [start, end] = interval(input.start, input.end);
    const manager = context.transactionManager!;
    await manager.execute(
      `insert into scheduling_reservation (id, owner_id, attempt_id, starts_at, ends_at, state)
       values (?, ?, ?, ?, ?, 'held') on conflict (id) do nothing`,
      [input.id, input.ownerId, input.attemptId, start, end],
    );
    const [row] = await manager.execute('select * from scheduling_reservation where id = ? for update', [
      input.id,
    ]);
    if (
      row.owner_id !== input.ownerId ||
      row.attempt_id !== input.attemptId ||
      new Date(row.starts_at).toISOString() !== start ||
      new Date(row.ends_at).toISOString() !== end ||
      row.state === 'released' ||
      row.deleted_at
    )
      throw new MedusaError(
        MedusaError.Types.NOT_ALLOWED,
        'Reservation identity was already used with different ownership, timing or a resolved attempt.',
      );
    return row;
  }

  @InjectManager()
  async confirm(input: Owner, @MedusaContext() context: Context<EntityManager> = {}) {
    return this.transition_(input, 'confirmed', context);
  }

  /** Only call after the owning event has atomically made finalization impossible. */
  @InjectManager()
  async release(input: Owner, @MedusaContext() context: Context<EntityManager> = {}) {
    return this.transition_(input, 'released', context);
  }

  @InjectTransactionManager()
  protected async transition_(
    input: Owner,
    state: 'confirmed' | 'released',
    @MedusaContext() context: Context<EntityManager> = {},
  ) {
    const rows = await context.transactionManager!.execute(
      `update scheduling_reservation set state = ?, updated_at = case when state = ? then updated_at else now() end
       where id = ? and owner_id = ? and attempt_id = ? and deleted_at is null
       and (state = ? or state = 'held' or (? = 'released' and state = 'confirmed')) returning id`,
      [state, state, input.id, input.ownerId, input.attemptId, state, state],
    );
    if (!rows.length)
      throw new MedusaError(MedusaError.Types.NOT_ALLOWED, 'Reservation ownership or state does not match.');
  }

  @InjectManager()
  async overlapping(start: string, end: string, @MedusaContext() context: Context<EntityManager> = {}) {
    const [from, to] = interval(start, end);
    if (new Date(to).getTime() - new Date(from).getTime() > 40 * 86400000)
      throw new MedusaError(MedusaError.Types.INVALID_DATA, 'Availability windows must not exceed 40 days.');
    return this.overlapping_(from, to, context);
  }

  @InjectTransactionManager()
  protected async overlapping_(
    start: string,
    end: string,
    @MedusaContext() context: Context<EntityManager> = {},
  ) {
    const manager = context.transactionManager!;
    await manager.execute(`set local statement_timeout = '5s'`);
    const rows = await manager.execute(
      `select id, owner_id, attempt_id, starts_at, ends_at, state from scheduling_reservation
       where deleted_at is null and state in ('held','confirmed') and starts_at < ? and ends_at > ?
       order by starts_at, id limit 10001`,
      [end, start],
    );
    if (rows.length > 10000) throw new Error('Availability result exceeds the complete-read bound.');
    return rows;
  }
}
export default SchedulingModuleService;
