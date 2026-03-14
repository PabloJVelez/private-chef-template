import type { ExecArgs } from '@medusajs/types';
import { ContainerRegistrationKeys, Modules } from '@medusajs/framework/utils';
import { deleteProductsWorkflow } from '@medusajs/medusa/core-flows';

/**
 * Selective wipe of seeded entities only. Preserves schema and migrations.
 * Deletes in reverse FK order (children before parents).
 */
export async function wipeSeededData(container: ExecArgs['container']): Promise<void> {
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER);

  const safeWipe = async (
    name: string,
    fn: () => Promise<void>,
  ): Promise<void> => {
    try {
      await fn();
      logger.info(`Wiped ${name}`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      logger.warn(`Wipe ${name} skipped or partial: ${msg}`);
    }
  };

  // 1. Product review responses & reviews (lambdacurry - may not exist)
  await safeWipe('product review responses', async () => {
    const prr = container.resolve('productReviewResponseModuleService') as
      | { listProductReviewResponses: (f: object) => Promise<{ id: string }[]>; deleteProductReviewResponses: (ids: string[]) => Promise<void> }
      | undefined;
    if (prr?.listProductReviewResponses && prr?.deleteProductReviewResponses) {
      const items = await prr.listProductReviewResponses({});
      if (items.length > 0) {
        await prr.deleteProductReviewResponses(items.map((i) => i.id));
      }
    }
  });

  await safeWipe('product reviews', async () => {
    const pr = container.resolve('productReviewModuleService') as
      | { listProductReviews: (f: object) => Promise<{ id: string }[]>; deleteProductReviews: (ids: string[]) => Promise<void> }
      | undefined;
    if (pr?.listProductReviews && pr?.deleteProductReviews) {
      const items = await pr.listProductReviews({});
      if (items.length > 0) {
        await pr.deleteProductReviews(items.map((i) => i.id));
      }
    }
  });

  // 2. Orders
  await safeWipe('orders', async () => {
    const orderService = container.resolve(Modules.ORDER) as {
      listOrders: (f: object) => Promise<{ id: string }[]>;
      deleteOrders: (ids: string[]) => Promise<void>;
    };
    const orders = await orderService.listOrders({});
    if (orders.length > 0) {
      await orderService.deleteOrders(orders.map((o) => o.id));
    }
  });

  // 3. Product-menu links — skip; product delete may cascade or links may be removed with products

  // 4. Products
  await safeWipe('products', async () => {
    const productService = container.resolve(Modules.PRODUCT) as {
      listProducts: (f: object) => Promise<{ id: string }[]>;
    };
    const products = await productService.listProducts({});
    if (products.length > 0) {
      await deleteProductsWorkflow(container).run({
        input: { ids: products.map((p) => p.id) },
      });
    }
  });

  // 5. Menu entities: ingredients → dishes → courses → menus
  await safeWipe('menu ingredients', async () => {
    const menuService = container.resolve('menuModuleService') as {
      listIngredients: (f: object) => Promise<{ id: string }[]>;
      deleteIngredients: (ids: string[]) => Promise<void>;
    };
    const items = await menuService.listIngredients({});
    if (items.length > 0) {
      await menuService.deleteIngredients(items.map((i) => i.id));
    }
  });

  await safeWipe('menu dishes', async () => {
    const menuService = container.resolve('menuModuleService') as {
      listDishes: (f: object) => Promise<{ id: string }[]>;
      deleteDishes: (ids: string[]) => Promise<void>;
    };
    const items = await menuService.listDishes({});
    if (items.length > 0) {
      await menuService.deleteDishes(items.map((i) => i.id));
    }
  });

  await safeWipe('menu courses', async () => {
    const menuService = container.resolve('menuModuleService') as {
      listCourses: (f: object) => Promise<{ id: string }[]>;
      deleteCourses: (ids: string[]) => Promise<void>;
    };
    const items = await menuService.listCourses({});
    if (items.length > 0) {
      await menuService.deleteCourses(items.map((i) => i.id));
    }
  });

  await safeWipe('menus', async () => {
    const menuService = container.resolve('menuModuleService') as {
      listMenus: (f: object) => Promise<{ id: string }[]>;
      deleteMenus: (ids: string[]) => Promise<void>;
    };
    const items = await menuService.listMenus({});
    if (items.length > 0) {
      await menuService.deleteMenus(items.map((i) => i.id));
    }
  });

  // 6. Shipping options
  await safeWipe('shipping options', async () => {
    const fulfillmentService = container.resolve(Modules.FULFILLMENT) as {
      listShippingOptions: (f: object) => Promise<{ id: string }[]>;
      deleteShippingOptions: (ids: string[]) => Promise<void>;
    };
    const items = await fulfillmentService.listShippingOptions({});
    if (items.length > 0) {
      await fulfillmentService.deleteShippingOptions(items.map((i) => i.id));
    }
  });

  // 7. Stock location / fulfillment links (simplified - links are often cascade-deleted with entities)
  // 8. Collections, categories, tags
  await safeWipe('collections', async () => {
    const productService = container.resolve(Modules.PRODUCT) as {
      listProductCollections: (f: object) => Promise<{ id: string }[]>;
      deleteProductCollections: (ids: string[]) => Promise<void>;
    };
    const items = await productService.listProductCollections({});
    if (items.length > 0) {
      await productService.deleteProductCollections(items.map((i) => i.id));
    }
  });

  await safeWipe('product categories', async () => {
    const productService = container.resolve(Modules.PRODUCT) as {
      listProductCategories: (f: object) => Promise<{ id: string }[]>;
      deleteProductCategories: (ids: string[]) => Promise<void>;
    };
    const items = await productService.listProductCategories({});
    if (items.length > 0) {
      await productService.deleteProductCategories(items.map((i) => i.id));
    }
  });

  await safeWipe('product tags', async () => {
    const productService = container.resolve(Modules.PRODUCT) as {
      listProductTags: (f: object) => Promise<{ id: string }[]>;
      deleteProductTags: (ids: string[]) => Promise<void>;
    };
    const items = await productService.listProductTags({});
    if (items.length > 0) {
      await productService.deleteProductTags(items.map((i) => i.id));
    }
  });

  // 9. Regions, tax regions
  await safeWipe('regions', async () => {
    const regionService = container.resolve(Modules.REGION) as {
      listRegions: (f: object) => Promise<{ id: string }[]>;
      deleteRegions: (ids: string[]) => Promise<void>;
    };
    const items = await regionService.listRegions({});
    if (items.length > 0) {
      await regionService.deleteRegions(items.map((i) => i.id));
    }
  });

  await safeWipe('tax regions', async () => {
    const taxService = container.resolve(Modules.TAX) as {
      listTaxRegions: (f: object) => Promise<{ id: string }[]>;
      deleteTaxRegions: (ids: string[]) => Promise<void>;
    };
    const items = await taxService.listTaxRegions({});
    if (items.length > 0) {
      await taxService.deleteTaxRegions(items.map((i) => i.id));
    }
  });

  // 10. Stock locations
  await safeWipe('stock locations', async () => {
    const stockService = container.resolve(Modules.STOCK_LOCATION) as {
      listStockLocations: (f: object) => Promise<{ id: string }[]>;
      deleteStockLocations: (ids: string[]) => Promise<void>;
    };
    const items = await stockService.listStockLocations({});
    if (items.length > 0) {
      await stockService.deleteStockLocations(items.map((i) => i.id));
    }
  });

  // 11. Fulfillment sets, shipping profiles
  await safeWipe('fulfillment sets', async () => {
    const fulfillmentService = container.resolve(Modules.FULFILLMENT) as {
      listFulfillmentSets: (f: object) => Promise<{ id: string }[]>;
      deleteFulfillmentSets: (ids: string[]) => Promise<void>;
    };
    const items = await fulfillmentService.listFulfillmentSets({});
    if (items.length > 0) {
      await fulfillmentService.deleteFulfillmentSets(items.map((i) => i.id));
    }
  });

  await safeWipe('shipping profiles', async () => {
    const fulfillmentService = container.resolve(Modules.FULFILLMENT) as {
      listShippingProfiles: (f: object) => Promise<{ id: string }[]>;
      deleteShippingProfiles: (ids: string[]) => Promise<void>;
    };
    const items = await fulfillmentService.listShippingProfiles({});
    if (items.length > 0) {
      await fulfillmentService.deleteShippingProfiles(items.map((i) => i.id));
    }
  });

  // 12. Sales channels
  await safeWipe('sales channels', async () => {
    const salesChannelService = container.resolve(Modules.SALES_CHANNEL) as {
      listSalesChannels: (f: object) => Promise<{ id: string }[]>;
      deleteSalesChannels: (ids: string[]) => Promise<void>;
    };
    const items = await salesChannelService.listSalesChannels({});
    if (items.length > 0) {
      await salesChannelService.deleteSalesChannels(items.map((i) => i.id));
    }
  });

  // 13. API keys (publishable)
  await safeWipe('api keys', async () => {
    const apiKeyService = container.resolve(Modules.API_KEY) as {
      listApiKeys: (f: object) => Promise<{ id: string }[]>;
      deleteApiKeys: (ids: string[]) => Promise<void>;
    };
    const items = await apiKeyService.listApiKeys({});
    if (items.length > 0) {
      await apiKeyService.deleteApiKeys(items.map((i) => i.id));
    }
  });

  logger.info('Selective wipe complete');
}
