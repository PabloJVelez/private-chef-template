/**
 * Unified init script: seed (US-only, chef experiences).
 * Run after migrate + sync. For full DB reset, use medusa:init (nukedb + prepare + init).
 */
import {
  createApiKeysWorkflow,
  createProductCategoriesWorkflow,
  createProductTagsWorkflow,
  createProductTypesWorkflow,
  createProductsWorkflow,
  createRegionsWorkflow,
  createSalesChannelsWorkflow,
  createShippingOptionsWorkflow,
  createShippingProfilesWorkflow,
  createStockLocationsWorkflow,
  createTaxRegionsWorkflow,
  linkSalesChannelsToApiKeyWorkflow,
  linkSalesChannelsToStockLocationWorkflow,
  updateStoresWorkflow,
} from '@medusajs/core-flows';
import { createCollectionsWorkflow } from '@medusajs/medusa/core-flows';
import type { ExecArgs } from '@medusajs/types';
import { ContainerRegistrationKeys, Modules } from '@medusajs/framework/utils';
import {
  seedMenuEntities,
  seedMenuProductsUsd,
} from './seed/chef-experiences';
import { seedExperienceTypes } from './seed/experience-types';
import { MENU_MODULE } from '../modules/menu';
import { EXPERIENCE_TYPE_MODULE } from '../modules/experience-type';
import type MenuModuleService from '../modules/menu/service';
import type ExperienceTypeModuleService from '../modules/experience-type/service';

export default async function init({ container }: ExecArgs) {
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER);
  const remoteLink = container.resolve(ContainerRegistrationKeys.LINK);
  const storeModuleService = container.resolve(Modules.STORE);

  logger.info('Starting init: seed (US-only, chef experiences)...');
  const [store] = await storeModuleService.listStores();

  const { result: salesChannelResult } = await createSalesChannelsWorkflow(
    container,
  ).run({
    input: {
      salesChannelsData: [{ name: 'Default Sales Channel' }],
    },
  });
  const defaultSalesChannel = salesChannelResult[0];

  await updateStoresWorkflow(container).run({
    input: {
      selector: { id: store.id },
      update: {
        supported_currencies: [{ currency_code: 'usd', is_default: true }],
        default_sales_channel_id: defaultSalesChannel.id,
      },
    },
  });
  logger.info('Store updated (USD only).');

  const { result: regionResult } = await createRegionsWorkflow(container).run({
    input: {
      regions: [
        {
          name: 'United States',
          currency_code: 'usd',
          countries: ['us'],
          payment_providers: ['pp_stripe-connect_stripe-connect'],
        },
      ],
    },
  });
  const usRegion = regionResult[0];
  logger.info('US region created.');

  await createTaxRegionsWorkflow(container).run({
    input: [{ country_code: 'us' }],
  });

  const { result: stockLocationResult } =
    await createStockLocationsWorkflow(container).run({
      input: {
        locations: [
          {
            name: 'Main Warehouse',
            address: {
              address_1: '123 Main Street',
              city: 'New York',
              country_code: 'US',
              province: 'NY',
              postal_code: '10001',
            },
          },
        ],
      },
    });
  const stockLocation = stockLocationResult[0];

  await remoteLink.create([
    {
      [Modules.STOCK_LOCATION]: { stock_location_id: stockLocation.id },
      [Modules.FULFILLMENT]: { fulfillment_provider_id: 'manual_manual' },
    },
  ]);

  const { result: shippingProfileResult } =
    await createShippingProfilesWorkflow(container).run({
      input: {
        data: [
          { name: 'Default', type: 'default' },
          { name: 'Digital Products', type: 'digital' },
        ],
      },
    });
  const shippingProfile = shippingProfileResult[0];
  const digitalShippingProfile = shippingProfileResult[1];

  const fulfillmentResult = await container
    .resolve(Modules.FULFILLMENT)
    .createFulfillmentSets({
      name: 'US Delivery',
      type: 'shipping',
      service_zones: [
        {
          name: 'United States',
          geo_zones: [{ country_code: 'us', type: 'country' }],
        },
      ],
    });
  const fulfillmentSet = Array.isArray(fulfillmentResult)
    ? fulfillmentResult[0]
    : (fulfillmentResult as { id: string; service_zones?: { id: string }[] });

  await remoteLink.create({
    [Modules.STOCK_LOCATION]: { stock_location_id: stockLocation.id },
    [Modules.FULFILLMENT]: { fulfillment_set_id: fulfillmentSet.id },
  });

  const serviceZoneId = fulfillmentSet.service_zones?.[0]?.id;
  if (!serviceZoneId) {
    throw new Error('Fulfillment set has no service zone');
  }

  await createShippingOptionsWorkflow(container).run({
    input: [
      {
        name: 'Standard Shipping',
        price_type: 'flat',
        provider_id: 'manual_manual',
        service_zone_id: serviceZoneId,
        shipping_profile_id: shippingProfile.id,
        type: { label: 'Standard', description: '2-3 days.', code: 'standard' },
        prices: [
          { currency_code: 'usd', amount: 5 },
          { region_id: usRegion.id, amount: 5 },
        ],
        rules: [
          { attribute: 'enabled_in_store', value: 'true', operator: 'eq' },
          { attribute: 'is_return', value: 'false', operator: 'eq' },
        ],
      },
      {
        name: 'Digital Delivery',
        price_type: 'flat',
        provider_id: 'manual_manual',
        service_zone_id: serviceZoneId,
        shipping_profile_id: digitalShippingProfile.id,
        type: {
          label: 'Digital',
          description: 'Instant delivery.',
          code: 'digital',
        },
        prices: [
          { currency_code: 'usd', amount: 0 },
          { region_id: usRegion.id, amount: 0 },
        ],
        rules: [
          { attribute: 'enabled_in_store', value: 'true', operator: 'eq' },
          { attribute: 'is_return', value: 'false', operator: 'eq' },
        ],
      },
    ],
  });

  const { result: digitalLocationResult } =
    await createStockLocationsWorkflow(container).run({
      input: {
        locations: [
          {
            name: 'Digital Location',
            address: {
              address_1: 'Digital Product Location',
              city: 'Digital',
              country_code: 'US',
              province: 'Digital',
              postal_code: '00000',
            },
          },
        ],
      },
    });
  const digitalLocation = digitalLocationResult[0];

  await linkSalesChannelsToStockLocationWorkflow(container).run({
    input: { id: stockLocation.id, add: [defaultSalesChannel.id] },
  });

  await linkSalesChannelsToStockLocationWorkflow(container).run({
    input: { id: digitalLocation.id, add: [defaultSalesChannel.id] },
  });

  const { result: collectionsResult } = await createCollectionsWorkflow(
    container,
  ).run({
    input: {
      collections: [{ title: 'Chef Experiences', handle: 'chef-experiences' }],
    },
  });

  const { result: categoryResult } = await createProductCategoriesWorkflow(
    container,
  ).run({
    input: {
      product_categories: [{ name: 'Chef Experiences', is_active: true }],
    },
  });

  const { result: productTagsResult } = await createProductTagsWorkflow(
    container,
  ).run({
    input: {
      product_tags: [
        { value: 'Chef Experience' },
        { value: 'Limited Availability' },
      ],
    },
  });

  const { result: experienceTypeResult } =
    await createProductTypesWorkflow(container).run({
      input: {
        product_types: [{ value: 'experience' }],
      },
    });
  const experienceTypeId = experienceTypeResult[0].id;

  const experienceTypeSvc: ExperienceTypeModuleService = container.resolve(EXPERIENCE_TYPE_MODULE);
  await seedExperienceTypes(experienceTypeSvc);
  logger.info('Experience types seeded.');

  const menuModuleService: MenuModuleService = container.resolve(MENU_MODULE);
  const createdMenus = await seedMenuEntities(menuModuleService);
  logger.info(`Created ${createdMenus.length} menus.`);

  const { result: menuProductResult } = await createProductsWorkflow(
    container,
  ).run({
    input: {
      products: seedMenuProductsUsd({
        collections: collectionsResult,
        tags: productTagsResult,
        categories: categoryResult,
        sales_channels: [{ id: defaultSalesChannel.id }],
        shipping_profile_id: digitalShippingProfile.id,
        experience_type_id: experienceTypeId,
      }),
    },
  });

  // Link key must match how the menu module is registered for links (see src/links/product-menu.ts).
  // If linking fails, run: medusa db:sync-links
  const menuLinkKey = 'menuModuleService';
  for (let i = 0; i < createdMenus.length && i < menuProductResult.length; i++) {
    try {
      await remoteLink.create([
        {
          [Modules.PRODUCT]: { product_id: menuProductResult[i].id },
          [menuLinkKey]: { menu_id: createdMenus[i].id },
        },
      ]);
      const productThumbnail =
        menuProductResult[i].thumbnail ??
        (menuProductResult[i].images?.[0] as { url?: string } | undefined)?.url;
      if (productThumbnail) {
        await menuModuleService.updateMenus({
          id: createdMenus[i].id,
          thumbnail: productThumbnail,
        });
      }
    } catch (err) {
      logger.warn(
        `Failed to link menu "${createdMenus[i].name}" to product: ${err}`,
      );
    }
  }

  const { result: apiKeyResult } = await createApiKeysWorkflow(container).run({
    input: {
      api_keys: [
        { title: 'Storefront', type: 'publishable', created_by: '' },
      ],
    },
  });
  const publishableApiKey = apiKeyResult[0];

  await linkSalesChannelsToApiKeyWorkflow(container).run({
    input: { id: publishableApiKey.id, add: [defaultSalesChannel.id] },
  });

  logger.info('Init complete.');
  logger.info(`PUBLISHABLE API KEY: ${publishableApiKey.token}`);
}
