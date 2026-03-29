import { ContainerRegistrationKeys, Modules } from '@medusajs/framework/utils';
import type { ExecArgs } from '@medusajs/types';

type OrderModuleForLineItemFix = {
  listOrderLineItems: (
    filters: Record<string, unknown>,
    config?: {
      take?: number;
      skip?: number;
      select?: string[];
      order?: Record<string, 'ASC' | 'DESC'>;
    },
  ) => Promise<Array<{ id: string; variant_sku: string | null; requires_shipping: boolean }>>;
  updateOrderLineItems: (lineItemId: string, data: { requires_shipping: boolean }) => Promise<unknown>;
};

/**
 * One-off / idempotent:
 *
 * 1. **Inventory** — `requires_shipping: false` on inventory rows whose SKU starts with `EVENT-`.
 *    Fixes catalog / future carts; Medusa reads this when building line items.
 *
 * 2. **Order line items** — same flag is **snapshotted** on `OrderLineItem` when the order is
 *    placed, so existing orders keep `requires_shipping: true` until updated here.
 *
 * Run: npx medusa exec ./src/scripts/fix-event-ticket-inventory-shipping.ts
 */
export default async function fixEventTicketInventoryShipping({ container }: ExecArgs) {
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER);
  const inventory = container.resolve(Modules.INVENTORY);
  const orderModule = container.resolve(Modules.ORDER) as OrderModuleForLineItemFix;

  const items = await inventory.listInventoryItems({});
  const eventItems = items.filter(
    (i) => typeof i.sku === 'string' && i.sku.startsWith('EVENT-') && i.requires_shipping !== false,
  );

  if (eventItems.length === 0) {
    logger.info('[fix-event-ticket-inventory] No EVENT-* inventory items need requires_shipping update');
  } else {
    for (const it of eventItems) {
      await inventory.updateInventoryItems({
        id: it.id,
        requires_shipping: false,
      });
      logger.info(`[fix-event-ticket-inventory] Updated inventory ${it.sku} (${it.id})`);
    }
    logger.info(`[fix-event-ticket-inventory] Inventory done: ${eventItems.length} item(s)`);
  }

  const take = 200;
  let skip = 0;
  let orderLinesUpdated = 0;

  /**
   * We filter by `requires_shipping: true` and then set it false for EVENT-* rows.
   * After updates, those rows drop out of the query — so we reset `skip` to 0 when we
   * changed anything. When a full page has no EVENT-* lines, advance `skip` past physical
   * shippable lines only.
   */
  for (;;) {
    const lineItems = await orderModule.listOrderLineItems(
      { requires_shipping: true },
      {
        take,
        skip,
        select: ['id', 'variant_sku', 'requires_shipping'],
        order: { id: 'ASC' },
      },
    );

    if (!lineItems.length) {
      break;
    }

    let updatedInBatch = 0;
    for (const li of lineItems) {
      const sku = li.variant_sku;
      if (typeof sku !== 'string' || !sku.startsWith('EVENT-')) {
        continue;
      }
      await orderModule.updateOrderLineItems(li.id, { requires_shipping: false });
      updatedInBatch += 1;
      orderLinesUpdated += 1;
      logger.info(`[fix-event-ticket-order-lines] Updated line ${li.id} (${sku})`);
    }

    if (updatedInBatch > 0) {
      skip = 0;
      continue;
    }

    if (lineItems.length < take) {
      break;
    }
    skip += take;
  }

  if (orderLinesUpdated === 0) {
    logger.info('[fix-event-ticket-order-lines] No EVENT-* order line items needed requires_shipping update');
  } else {
    logger.info(`[fix-event-ticket-order-lines] Done: ${orderLinesUpdated} line item(s)`);
  }
}
