import type { MedusaContainer } from '@medusajs/framework/types';
import { Modules } from '@medusajs/framework/utils';

/** Same name as `init` / `accept-chef-event` seeding. */
export const DIGITAL_STOCK_LOCATION_NAME = 'Digital Location';

export async function getDigitalStockLocationId(container: MedusaContainer): Promise<string | null> {
  const stockLocation = container.resolve(Modules.STOCK_LOCATION);
  const rows = await stockLocation.listStockLocations({ name: DIGITAL_STOCK_LOCATION_NAME });
  return rows?.[0]?.id ?? null;
}
