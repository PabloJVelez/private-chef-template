import type { MedusaContainer } from '@medusajs/framework/types';
import { ContainerRegistrationKeys, Modules, remoteQueryObjectFromString } from '@medusajs/framework/utils';
import { createOrderFulfillmentWorkflow, markOrderFulfillmentAsDeliveredWorkflow } from '@medusajs/medusa/core-flows';
import type { OrderDTO } from '@medusajs/types';
import { DIGITAL_STOCK_LOCATION_NAME, getDigitalStockLocationId } from '../lib/digital-stock-location';
import { getUnfulfilledEventTicketLineItems } from '../lib/event-ticket';

/** Matches `accept-chef-event` / init seed shipping option name. */
export const DIGITAL_DELIVERY_SHIPPING_OPTION_NAME = 'Digital Delivery';

type ShippingMethodLike = {
  /** Persisted shipping method label (same as shipping option name at checkout). */
  name?: string;
  shipping_option_id?: string | null;
  shipping_option?: { name?: string | null; shipping_profile?: { type?: string | null } | null } | null;
};

type OrderGraphRow = {
  id: string;
  items?: Array<{
    id: string;
    variant_sku?: string | null;
    quantity: number;
    detail?: { fulfilled_quantity?: number | null };
  }>;
  shipping_methods?: ShippingMethodLike[];
};

interface OrderModuleRetrieve {
  retrieveOrder: (id: string, config?: { relations?: string[] }) => Promise<OrderDTO>;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function firstRemoteQueryRow(result: unknown): unknown {
  if (Array.isArray(result)) {
    return result[0];
  }
  if (isRecord(result) && Array.isArray(result.rows)) {
    return result.rows[0];
  }
  return undefined;
}

function readOrderIdFromOrderPaymentRow(row: unknown): string | null {
  if (!isRecord(row)) {
    return null;
  }
  const order = row.order;
  if (!isRecord(order)) {
    return null;
  }
  const id = order.id;
  return typeof id === 'string' ? id : null;
}

function readNumber(value: unknown): number | null {
  if (typeof value === 'number' && !Number.isNaN(value)) {
    return value;
  }
  if (isRecord(value)) {
    const raw = value.value;
    if (typeof raw === 'number' && !Number.isNaN(raw)) {
      return raw;
    }
    if (typeof raw === 'string') {
      const parsed = Number.parseFloat(raw);
      return Number.isNaN(parsed) ? null : parsed;
    }
  }
  return null;
}

function readFulfillmentId(value: unknown): string | null {
  if (!isRecord(value)) {
    return null;
  }
  const id = value.id;
  return typeof id === 'string' ? id : null;
}

/**
 * Map formatted {@link OrderDTO} into the slim shape used for ticket detection.
 * Uses the order module (not remote-query graphs) so MikroORM populate hints stay valid.
 */
function orderDtoToTicketGraphRow(order: OrderDTO): OrderGraphRow {
  const items: NonNullable<OrderGraphRow['items']> = [];

  for (const item of order.items ?? []) {
    const qty = readNumber(item.quantity);
    if (qty === null) {
      continue;
    }
    const fulfilled = readNumber(item.detail?.fulfilled_quantity) ?? 0;
    items.push({
      id: item.id,
      variant_sku: item.variant_sku ?? null,
      quantity: qty,
      detail: { fulfilled_quantity: fulfilled },
    });
  }

  const shipping_methods: ShippingMethodLike[] = (order.shipping_methods ?? []).map((sm) => ({
    name: sm.name,
    shipping_option_id: sm.shipping_option_id ?? null,
  }));

  return { id: order.id, items, shipping_methods };
}

function resolveDigitalShippingOptionId(order: OrderGraphRow): string | null {
  const methods = order.shipping_methods ?? [];
  for (const sm of methods) {
    const label = sm.shipping_option?.name ?? sm.name;
    const profileType = sm.shipping_option?.shipping_profile?.type;
    if (label === DIGITAL_DELIVERY_SHIPPING_OPTION_NAME || profileType === 'digital') {
      if (sm.shipping_option_id) {
        return sm.shipping_option_id;
      }
    }
  }
  if (methods[0]?.shipping_option_id) {
    return methods[0].shipping_option_id;
  }
  return null;
}

async function executeRemoteQuery(
  container: MedusaContainer,
  params: { entryPoint: string; variables: Record<string, unknown>; fields: string[] },
): Promise<unknown> {
  const remoteQueryFn = container.resolve(ContainerRegistrationKeys.REMOTE_QUERY);
  const queryObject = remoteQueryObjectFromString({
    entryPoint: params.entryPoint,
    variables: params.variables,
    fields: params.fields,
  });
  return remoteQueryFn(queryObject);
}

async function resolveOrderIdFromPaymentId(container: MedusaContainer, paymentId: string): Promise<string | null> {
  const paymentModule = container.resolve(Modules.PAYMENT);
  const payment = await paymentModule.retrievePayment(paymentId);
  const collectionId = payment.payment_collection_id;
  if (!collectionId) {
    return null;
  }

  const result = await executeRemoteQuery(container, {
    entryPoint: 'order_payment_collection',
    variables: { payment_collection_id: collectionId },
    fields: ['order.id'],
  });

  return readOrderIdFromOrderPaymentRow(firstRemoteQueryRow(result));
}

async function loadOrderForTicketFulfillment(
  container: MedusaContainer,
  orderId: string,
): Promise<OrderGraphRow | null> {
  const orderModule = container.resolve(Modules.ORDER) as OrderModuleRetrieve;

  const order = await orderModule.retrieveOrder(orderId, {
    relations: ['items', 'items.item', 'shipping_methods'],
  });
  if (!order?.id) {
    return null;
  }
  return orderDtoToTicketGraphRow(order);
}

/**
 * After payment capture, create a fulfillment for unfulfilled EVENT-* line items only.
 */
export async function fulfillEventTicketLinesForPayment(
  container: MedusaContainer,
  paymentId: string,
): Promise<{ orderId: string | null; fulfilled: boolean }> {
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER);

  const orderId = await resolveOrderIdFromPaymentId(container, paymentId);

  if (!orderId) {
    logger.warn(`[event-ticket-fulfill] No order linked to payment ${paymentId}`);
    return { orderId: null, fulfilled: false };
  }

  const order = await loadOrderForTicketFulfillment(container, orderId);
  if (!order) {
    logger.warn(`[event-ticket-fulfill] Order ${orderId} not found for payment ${paymentId}`);
    return { orderId, fulfilled: false };
  }

  const toFulfill = getUnfulfilledEventTicketLineItems(order.items);
  if (!toFulfill.length) {
    return { orderId, fulfilled: false };
  }

  const shippingOptionId = resolveDigitalShippingOptionId(order);
  if (!shippingOptionId) {
    logger.error(
      `[event-ticket-fulfill] Order ${orderId}: no digital shipping option; cannot auto-fulfill ticket lines`,
    );
    return { orderId, fulfilled: false };
  }

  const digitalLocationId = await getDigitalStockLocationId(container);
  if (!digitalLocationId) {
    logger.error(
      `[event-ticket-fulfill] Order ${orderId}: "${DIGITAL_STOCK_LOCATION_NAME}" stock location missing; cannot auto-fulfill ticket lines`,
    );
    return { orderId, fulfilled: false };
  }

  try {
    const { result: createdFulfillment } = await createOrderFulfillmentWorkflow(container).run({
      input: {
        order_id: orderId,
        items: toFulfill,
        shipping_option_id: shippingOptionId,
        location_id: digitalLocationId,
      },
    });

    const fulfillmentId = readFulfillmentId(createdFulfillment);
    if (!fulfillmentId) {
      logger.error(`[event-ticket-fulfill] Order ${orderId} payment ${paymentId}: create fulfillment returned no id`);
      return { orderId, fulfilled: false };
    }

    /**
     * Digital ticket fulfillments use `requires_shipping: false`. Admin shows "Awaiting delivery" until
     * `delivered_at` is set — same as clicking "Mark as delivered" on the fulfillment.
     */
    await markOrderFulfillmentAsDeliveredWorkflow(container).run({
      input: { orderId, fulfillmentId },
    });

    logger.info(
      `[event-ticket-fulfill] Fulfilled and marked delivered ${toFulfill.length} ticket line(s) on order ${orderId} (payment ${paymentId}, fulfillment ${fulfillmentId})`,
    );
    return { orderId, fulfilled: true };
  } catch (e) {
    logger.error(
      `[event-ticket-fulfill] Failed order ${orderId} payment ${paymentId}: ${e instanceof Error ? e.message : String(e)}`,
    );
    throw e;
  }
}
