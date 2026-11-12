import type { z } from '@medusajs/framework/zod';
import type { calendarQuery } from '../../lib/chef-workspace/query';
import { summaryFields, type PrivateEventRead } from '../../lib/chef-workspace/private-event';
import { createHash, randomUUID } from 'node:crypto';
import { AcceptanceAttempt } from './models/acceptance-attempt';
import type { Context } from '@medusajs/framework/types';
import type { EntityManager } from '@medusajs/framework/mikro-orm/knex';
import {
  InjectManager,
  InjectTransactionManager,
  MedusaContext,
  MedusaError,
  MedusaService,
} from '@medusajs/framework/utils';
import ChefEventModel from './models/chef-event';
import type { ChefEventAdditionalCharge } from './models/chef-event';

type MutableAdditionalChargeInput = {
  id?: string;
  name: string;
  amount: number;
  status?: 'pending' | 'paid' | 'void';
  notes?: string | null;
  sort_order?: number | null;
};

type MarkChargePaidInput = {
  chargeId: string;
  orderId: string;
  paidAt?: Date;
};

class ChefEventModuleService extends MedusaService({
  AcceptanceAttempt,
  ChefEvent: ChefEventModel,
}) {
  /** Read only, bounded to display intervals. SQL is needed for per-row duration overlap. */
  @InjectManager()
  async readCalendarEvents(
    query: z.infer<typeof calendarQuery>,
    limit: number,
    @MedusaContext() context: Context<EntityManager> = {},
  ): Promise<PrivateEventRead[]> {
    return this.readCalendarEvents_(query, limit, context);
  }

  @InjectTransactionManager()
  protected async readCalendarEvents_(
    query: z.infer<typeof calendarQuery>,
    limit: number,
    @MedusaContext() context: Context<EntityManager> = {},
  ): Promise<PrivateEventRead[]> {
    const manager = context.transactionManager!;
    await manager.execute(`set local statement_timeout = '5s'`);
    const where = [
      'deleted_at is null',
      '"requestedDate" < ?',
      // A zero-duration legacy event is a point; otherwise intervals are half open.
      `("requestedDate" + coalesce("estimatedDuration", 60) * interval '1 minute' > ?
        or ("estimatedDuration" = 0 and "requestedDate" >= ?))`,
    ];
    const params: unknown[] = [query.end, query.start, query.start];
    const statuses = query.statuses?.length ? query.statuses : query.status && query.status !== 'all' ? [query.status] : [];
    if (statuses.length) {
      where.push(`status in (${statuses.map(() => '?').join(',')})`);
      params.push(...statuses);
    }
    if (query.eventType && query.eventType !== 'all') {
      where.push('"eventType" = ?'); params.push(query.eventType);
    }
    if (query.locationType && query.locationType !== 'all') {
      where.push('"locationType" = ?'); params.push(query.locationType);
    }
    if (query.q) {
      where.push('("firstName" ilike ? or "lastName" ilike ? or "eventType" ilike ?)');
      const search = '%' + query.q.replace(/[\\%_]/g, '\\$&') + '%';
      params.push(search, search, search);
    }
    return manager.execute(
      `select ${summaryFields.map(field => '"' + field + '"').join(',')} from chef_event
       where ${where.join(' and ')} order by "requestedDate", id limit ?`,
      [...params, limit],
    );
  }

  @InjectManager()
  async claimAcceptance(
    input: {
      id: string;
      token: string;
      updatedAt: Date;
      start: string;
      end: string;
      snapshot: Record<string, unknown>;
    },
    @MedusaContext() context: Context<EntityManager> = {},
  ) {
    return this.claimAcceptance_(input, context);
  }

  @InjectTransactionManager()
  protected async claimAcceptance_(
    input: {
      id: string;
      token: string;
      updatedAt: Date;
      start: string;
      end: string;
      snapshot: Record<string, unknown>;
    },
    @MedusaContext() context: Context<EntityManager> = {},
  ) {
    const rows = await context.transactionManager!.execute(
      `update chef_event set "estimatedDuration" = ?, "timeZone" = ?, "acceptanceToken" = ?, "acceptanceExecution" = ?, "occupiedStart" = ?, "occupiedEnd" = ?, "availabilitySnapshot" = ?::jsonb, updated_at = now() where id = ? and status = 'pending' and "acceptanceToken" is null and "productId" is null and deleted_at is null and date_trunc('milliseconds', updated_at) = ? and "acceptanceExecution" = ? and exists(select 1 from chef_event_acceptance_attempt a where a.id = ? and a.event_id = chef_event.id and a.state = 'active') returning id`,
      [
        input.snapshot.duration_minutes,
        input.snapshot.timezone,
        input.token,
        input.token,
        input.start,
        input.end,
        JSON.stringify(input.snapshot),
        input.id,
        input.updatedAt,
        input.token,
        input.token,
      ],
    );
    if (!rows.length) {
      const [identical] = await context.transactionManager!.execute(
        `select id from chef_event where id = ? and "acceptanceExecution" = ? and deleted_at is null
          and ("acceptanceToken" = ? or (status in ('confirmed','completed') and "productId" is not null))
          and "occupiedStart" = ? and "occupiedEnd" = ? and "availabilitySnapshot" = ?::jsonb`,
        [input.id, input.token, input.token, input.start, input.end, JSON.stringify(input.snapshot)],
      );
      if (identical) return;
      throw new MedusaError(
        MedusaError.Types.NOT_ALLOWED,
        'Event changed or acceptance is already in progress. Reload before accepting.',
      );
    }
  }

  @InjectManager()
  async releaseAcceptance(id: string, token: string, @MedusaContext() context: Context<EntityManager> = {}) {
    return this.releaseAcceptance_(id, token, context);
  }

  @InjectTransactionManager()
  protected async releaseAcceptance_(
    id: string,
    token: string,
    @MedusaContext() context: Context<EntityManager> = {},
  ) {
    const rows = await context.transactionManager!.execute(
      `update chef_event set "acceptanceToken" = null, "occupiedStart" = null, "occupiedEnd" = null, "availabilitySnapshot" = null, updated_at = now() where id = ? and "acceptanceToken" = ? and status = 'pending' and "productId" is null returning id`,
      [id, token],
    );
    if (rows.length)
      await context.transactionManager!.execute(
        `update chef_event_acceptance_attempt set state = 'aborted', updated_at = now() where id = ? and event_id = ? and state = 'active'`,
        [token, id],
      );
    const [attempt] = await context.transactionManager!.execute(
      `select state from chef_event_acceptance_attempt where id = ? and event_id = ?`,
      [token, id],
    );
    return rows.length > 0 || attempt?.state === 'aborted';
  }

  /** Called only after owned product cleanup and reservation release have completed. */
  @InjectManager()
  async completeAcceptanceCleanup(
    id: string,
    token: string,
    @MedusaContext() context: Context<EntityManager> = {},
  ) {
    return this.completeAcceptanceCleanup_(id, token, context);
  }

  @InjectTransactionManager()
  protected async completeAcceptanceCleanup_(
    id: string,
    token: string,
    @MedusaContext() context: Context<EntityManager> = {},
  ) {
    await context.transactionManager!.execute(
      `update chef_event_acceptance_attempt set cleanup_completed_at = coalesce(cleanup_completed_at, now()), updated_at = now()
       where id = ? and event_id = ? and state = 'aborted'`,
      [token, id],
    );
  }

  @InjectManager()
  async bindAcceptance(
    input: {
      eventId: string;
      actorId: string;
      requestKey?: string;
      body: Record<string, unknown>;
    },
    @MedusaContext() context: Context<EntityManager> = {},
  ) {
    return this.bindAcceptance_(input, context);
  }

  @InjectTransactionManager()
  protected async bindAcceptance_(
    input: {
      eventId: string;
      actorId: string;
      requestKey?: string;
      body: Record<string, unknown>;
    },
    @MedusaContext() context: Context<EntityManager> = {},
  ) {
    const manager = context.transactionManager!;
    const [event] = await manager.execute(
      'select * from chef_event where id = ? and deleted_at is null for update',
      [input.eventId],
    );
    if (!event) throw new MedusaError(MedusaError.Types.NOT_FOUND, 'Event not found.');
    let attempt;
    if (input.requestKey) {
      [attempt] = await manager.execute(
        `select * from chef_event_acceptance_attempt where event_id = ? and actor_id = ? and request_key = ?`,
        [input.eventId, input.actorId, input.requestKey],
      );
    } else if (event.acceptanceExecution) {
      [attempt] = await manager.execute('select * from chef_event_acceptance_attempt where id = ?', [
        event.acceptanceExecution,
      ]);
    }
    if (attempt) {
      const [same] = await manager.execute(
        'select actor_id = ? and input = ?::jsonb as matches from chef_event_acceptance_attempt where id = ?',
        [input.actorId, JSON.stringify(input.body), attempt.id],
      );
      if (!same?.matches)
        throw new MedusaError(
          MedusaError.Types.NOT_ALLOWED,
          'This acceptance attempt belongs to another actor or different input.',
        );
      return attempt;
    }
    if (event.status !== 'pending' || event.productId || event.acceptanceToken)
      throw new MedusaError(
        MedusaError.Types.NOT_ALLOWED,
        'Only an unclaimed pending request can start an acceptance attempt.',
      );
    if (event.acceptanceExecution) {
      const [prior] = await manager.execute(
        'select state, cleanup_completed_at from chef_event_acceptance_attempt where id = ?',
        [event.acceptanceExecution],
      );
      if (prior?.state !== 'aborted' || !prior.cleanup_completed_at)
        throw new MedusaError(
          MedusaError.Types.NOT_ALLOWED,
          'Resume or finish cleanup of the existing acceptance attempt.',
        );
    }
    const key = input.requestKey || randomUUID();
    const id =
      'accept_' +
      createHash('sha256')
        .update(JSON.stringify([input.eventId, input.actorId, key]))
        .digest('hex');
    await manager.execute(
      `insert into chef_event_acceptance_attempt(id,event_id,actor_id,request_key,input) values(?,?,?,?,?::jsonb)`,
      [id, input.eventId, input.actorId, key, JSON.stringify(input.body)],
    );
    await manager.execute('update chef_event set "acceptanceExecution" = ? where id = ?', [
      id,
      input.eventId,
    ]);
    return {
      id,
      event_id: input.eventId,
      actor_id: input.actorId,
      request_key: key,
      input: input.body,
      state: 'active',
    };
  }

  @InjectManager()
  async cancelEvent(
    input: { id: string } & Record<string, unknown>,
    @MedusaContext() context: Context<EntityManager> = {},
  ) {
    return this.cancelEvent_(input, context);
  }

  @InjectTransactionManager()
  protected async cancelEvent_(
    input: { id: string } & Record<string, unknown>,
    @MedusaContext() context: Context<EntityManager> = {},
  ) {
    await context.transactionManager!.execute('select id from chef_event where id = ? for update', [
      input.id,
    ]);
    const event = await this.updateChefEvents({ ...input, status: 'cancelled' }, context);
    // A cancelled unclaimed attempt cannot be resumed if this request is later reopened.
    if (event.acceptanceExecution)
      await context.transactionManager!.execute(
        `update chef_event_acceptance_attempt set state = 'aborted', updated_at = now() where id = ? and event_id = ? and state = 'active'`,
        [event.acceptanceExecution, input.id],
      );
    return event;
  }

  @InjectManager()
  async abortUnclaimedAcceptance(
    id: string,
    token: string,
    @MedusaContext() context: Context<EntityManager> = {},
  ) {
    return this.abortUnclaimedAcceptance_(id, token, context);
  }

  @InjectTransactionManager()
  protected async abortUnclaimedAcceptance_(
    id: string,
    token: string,
    @MedusaContext() context: Context<EntityManager> = {},
  ) {
    const [event] = await context.transactionManager!.execute(
      `select id from chef_event where id = ? and "acceptanceExecution" = ?
      and status = 'pending' and "acceptanceToken" is null and "productId" is null for update`,
      [id, token],
    );
    if (!event) return false;
    const rows = await context.transactionManager!.execute(
      `update chef_event_acceptance_attempt set state = 'aborted', updated_at = now()
      where id = ? and event_id = ? and state in ('active','aborted') returning id`,
      [token, id],
    );
    return rows.length > 0;
  }

  @InjectManager()
  async finalizeAcceptance(
    input: {
      id: string;
      token: string;
      productId: string;
      chefNotes?: string;
      acceptedBy?: string;
      sendAcceptanceEmail?: boolean;
    },
    @MedusaContext() context: Context<EntityManager> = {},
  ) {
    return this.finalizeAcceptance_(input, context);
  }

  @InjectTransactionManager()
  protected async finalizeAcceptance_(
    input: {
      id: string;
      token: string;
      productId: string;
      chefNotes?: string;
      acceptedBy?: string;
      sendAcceptanceEmail?: boolean;
    },
    @MedusaContext() context: Context<EntityManager> = {},
  ) {
    const manager = context.transactionManager!;
    const rows = await manager.execute(
      `update chef_event set status = 'confirmed', "productId" = ?, "acceptanceToken" = null,
      "acceptedAt" = now(), "acceptedBy" = ?, "chefNotes" = ?, "sendAcceptanceEmail" = ?, updated_at = now()
      where id = ? and status = 'pending' and "acceptanceToken" = ? and "acceptanceExecution" = ? and "productId" is null and deleted_at is null returning *`,
      [
        input.productId,
        input.acceptedBy || 'chef',
        input.chefNotes ?? null,
        input.sendAcceptanceEmail ?? true,
        input.id,
        input.token,
        input.token,
      ],
    );
    const [event] = rows.length
      ? rows
      : await manager.execute(
          `select * from chef_event where id = ? and "acceptanceExecution" = ? and "productId" = ? and status in ('confirmed','completed') and deleted_at is null`,
          [input.id, input.token, input.productId],
        );
    if (!event) throw new MedusaError(MedusaError.Types.NOT_ALLOWED, 'Acceptance claim was lost.');
    await manager.execute(
      `update chef_event_acceptance_attempt set state = 'finalized', updated_at = now() where id = ? and event_id = ?`,
      [input.token, input.id],
    );
    return event;
  }

  private normalizeExistingCharges(raw: unknown): ChefEventAdditionalCharge[] {
    if (!Array.isArray(raw)) {
      return []
    }

    return raw.filter((row): row is ChefEventAdditionalCharge => {
      return (
        typeof row === "object" &&
        row !== null &&
        typeof (row as ChefEventAdditionalCharge).id === "string" &&
        typeof (row as ChefEventAdditionalCharge).name === "string" &&
        typeof (row as ChefEventAdditionalCharge).amount === "number" &&
        typeof (row as ChefEventAdditionalCharge).status === "string"
      )
    })
  }

  private nowIso(): string {
    return new Date().toISOString()
  }

  private normalizeIncomingRows(
    incoming: MutableAdditionalChargeInput[],
    existingById: Map<string, ChefEventAdditionalCharge>,
  ): ChefEventAdditionalCharge[] {
    const now = this.nowIso()

    return incoming.map((row, index) => {
      const id = row.id?.trim() || `charge_${crypto.randomUUID()}`
      const prior = existingById.get(id)

      if (row.amount < 0 || !Number.isInteger(row.amount)) {
        throw new MedusaError(
          MedusaError.Types.INVALID_DATA,
          `additionalCharges[${index}].amount must be a non-negative integer (cents)`,
        )
      }

      if (prior?.status === "paid") {
        if (row.name !== prior.name || row.amount !== prior.amount) {
          throw new MedusaError(
            MedusaError.Types.NOT_ALLOWED,
            `Paid additional charge rows cannot change name or amount (id: ${id})`,
          )
        }
      }

      const status = row.status ?? prior?.status ?? "pending"
      const created_at = prior?.created_at ?? now
      const paid_at = status === "paid" ? prior?.paid_at ?? now : null
      const paid_order_id = status === "paid" ? prior?.paid_order_id ?? null : null

      return {
        id,
        name: row.name.trim(),
        amount: row.amount,
        status,
        notes: row.notes ?? null,
        sort_order: row.sort_order ?? null,
        created_at,
        updated_at: now,
        paid_at,
        paid_order_id,
      }
    })
  }

  async setAdditionalCharges(
    chefEventId: string,
    incoming: MutableAdditionalChargeInput[],
  ) {
    const event = await this.retrieveChefEvent(chefEventId)
    if (!event) {
      throw new MedusaError(
        MedusaError.Types.NOT_FOUND,
        `Chef event with id ${chefEventId} not found`,
      )
    }

    const existing = this.normalizeExistingCharges((event as Record<string, unknown>).additionalCharges)
    const existingById = new Map(existing.map((c) => [c.id, c]))
    const normalized = this.normalizeIncomingRows(incoming, existingById)

    const updated = await this.updateChefEvents({
      id: chefEventId,
      additionalCharges: normalized as unknown as never,
    })

    return Array.isArray(updated) ? updated[0] : updated
  }

  async markChargesPaidByOrder(
    chefEventId: string,
    rows: MarkChargePaidInput[],
  ) {
    if (!rows.length) {
      return this.retrieveChefEvent(chefEventId)
    }

    const event = await this.retrieveChefEvent(chefEventId)
    if (!event) {
      throw new MedusaError(
        MedusaError.Types.NOT_FOUND,
        `Chef event with id ${chefEventId} not found`,
      )
    }

    const toMark = new Map(rows.map((r) => [r.chargeId, r]))
    const existing = this.normalizeExistingCharges((event as Record<string, unknown>).additionalCharges)
    const now = this.nowIso()

    const next = existing.map((charge) => {
      const marker = toMark.get(charge.id)
      if (!marker || charge.status === "paid") {
        return charge
      }

      return {
        ...charge,
        status: "paid" as const,
        paid_order_id: marker.orderId,
        paid_at: (marker.paidAt ?? new Date(now)).toISOString(),
        updated_at: now,
      }
    })

    const updated = await this.updateChefEvents({
      id: chefEventId,
      additionalCharges: next as unknown as never,
    })

    return Array.isArray(updated) ? updated[0] : updated
  }
}

export default ChefEventModuleService