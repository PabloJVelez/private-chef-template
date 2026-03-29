import { ContainerRegistrationKeys, Modules } from '@medusajs/framework/utils';
import { markOrderFulfillmentAsDeliveredWorkflow } from '@medusajs/medusa/core-flows';
import type { ExecArgs, MedusaContainer, RemoteQueryFunction } from '@medusajs/types';
import { isEventTicketSku } from '../lib/event-ticket';

const TAG = '[backfill-event-ticket-delivered]';

/**
 * Resolve the parent order id for a line item using {@link Query.graph}.
 *
 * `retrieveOrderLineItem` cannot use `relations: ["order"]` / `["detail"]` here: those names are not
 * MikroORM relationship properties on `OrderLineItem`, which triggers ValidationError (see
 * https://docs.medusajs.com/resources/troubleshooting/validation-error — use Query for shapes the
 * module service cannot populate).
 *
 * Same pattern as `query.graph({ entity: "order", filters: { items: … } })` elsewhere in this app
 * (e.g. post-event ticket payment capture).
 */
type QueryGraphClient = Pick<RemoteQueryFunction, 'graph'>;

async function resolveOrderIdForLineItem(query: QueryGraphClient, lineItemId: string): Promise<string | null> {
  const { data } = await query.graph({
    entity: 'order',
    fields: ['id'],
    filters: {
      items: { id: lineItemId },
    } as Record<string, unknown>,
  });

  const rows = (data ?? []) as Array<{ id?: string }>;
  const id = rows[0]?.id;
  return typeof id === 'string' && id.length > 0 ? id : null;
}

/**
 * Mark **delivered** on fulfillments that:
 * - not canceled / not already delivered
 * - every fulfilled line item has an `EVENT-*` SKU (chef event tickets only)
 *
 * Note: Admin/manual fulfillments may use Main Warehouse and still have `requires_shipping: true`
 * on the fulfillment record; we still mark those delivered so the admin clears "Awaiting delivery".
 *
 * Idempotent: skips fulfillments that already have `delivered_at`.
 *
 * Run:
 *   npx medusa exec ./src/scripts/backfill-event-ticket-fulfillments-delivered.ts
 * Dry run (log only):
 *   npx medusa exec ./src/scripts/backfill-event-ticket-fulfillments-delivered.ts -- --dry-run
 * Verbose (why each fulfillment was skipped):
 *   npx medusa exec ./src/scripts/backfill-event-ticket-fulfillments-delivered.ts -- --verbose
 */
export default async function backfillEventTicketFulfillmentsDelivered({ container }: ExecArgs) {
  const c = container as MedusaContainer;
  const logger = c.resolve(ContainerRegistrationKeys.LOGGER);
  const fulfillment = c.resolve(Modules.FULFILLMENT);
  const orderModule = c.resolve(Modules.ORDER);
  const query: QueryGraphClient = c.resolve(ContainerRegistrationKeys.QUERY);

  const dryRun = process.argv.includes('--dry-run');
  const verbose = process.argv.includes('--verbose');

  const take = 100;
  let skip = 0;
  let scanned = 0;
  let marked = 0;
  let dryRunCandidates = 0;
  let skipped = 0;

  for (;;) {
    const rows = await fulfillment.listFulfillments({}, { take, skip, relations: ['items'] });
    if (!rows.length) {
      break;
    }

    for (const f of rows) {
      scanned += 1;

      if (f.delivered_at) {
        if (verbose) {
          logger.info(`${TAG} skip ${f.id}: already delivered`);
        }
        skipped += 1;
        continue;
      }
      if (f.canceled_at) {
        if (verbose) {
          logger.info(`${TAG} skip ${f.id}: canceled`);
        }
        skipped += 1;
        continue;
      }

      const fItems = f.items ?? [];
      if (!fItems.length) {
        logger.warn(`${TAG} Fulfillment ${f.id}: no items on record (ensure list uses relations: ['items']) — skip`);
        skipped += 1;
        continue;
      }

      const orderIds = new Set<string>();
      let allEventTickets = true;

      for (const fi of fItems) {
        if (!fi.line_item_id) {
          allEventTickets = false;
          break;
        }
        const li = await orderModule.retrieveOrderLineItem(fi.line_item_id);
        const sku = li.variant_sku;
        if (!isEventTicketSku(sku)) {
          if (verbose) {
            logger.info(`${TAG} skip ${f.id}: line ${fi.line_item_id} SKU is not EVENT-* (${sku ?? 'empty'})`);
          }
          allEventTickets = false;
          break;
        }
        const oid = await resolveOrderIdForLineItem(query, fi.line_item_id);
        if (oid) {
          orderIds.add(oid);
        }
      }

      if (!allEventTickets) {
        skipped += 1;
        continue;
      }
      if (orderIds.size !== 1) {
        logger.warn(
          `${TAG} Fulfillment ${f.id}: expected exactly one order_id from line items, got ${orderIds.size} — skip`,
        );
        skipped += 1;
        continue;
      }

      const orderId = [...orderIds][0]!;

      if (dryRun) {
        dryRunCandidates += 1;
        logger.info(`${TAG} [dry-run] Would mark delivered fulfillment ${f.id} (order ${orderId})`);
        continue;
      }

      try {
        await markOrderFulfillmentAsDeliveredWorkflow(c).run({
          input: { orderId, fulfillmentId: f.id },
        });
        marked += 1;
        logger.info(`${TAG} Marked delivered fulfillment ${f.id} (order ${orderId})`);
      } catch (e) {
        logger.warn(`${TAG} Fulfillment ${f.id} order ${orderId}: ${e instanceof Error ? e.message : String(e)}`);
        skipped += 1;
      }
    }

    if (rows.length < take) {
      break;
    }
    skip += take;
  }

  logger.info(
    `${TAG} Done. Scanned ${scanned} fulfillment(s), skipped ${skipped}` +
      (dryRun ? `, would mark ${dryRunCandidates} (dry run).` : `, marked ${marked}.`),
  );
}
