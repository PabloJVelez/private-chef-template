import type { ExecArgs } from '@medusajs/types';
import { ContainerRegistrationKeys, Modules } from '@medusajs/framework/utils';
import { seedMenuEntities } from './seed/menus';
import { 
  createRegionsWorkflow,
  createShippingProfilesWorkflow,
  createShippingOptionsWorkflow,
  createStockLocationsWorkflow,
  createSalesChannelsWorkflow,
  linkSalesChannelsToStockLocationWorkflow,
  createApiKeysWorkflow,
  linkSalesChannelsToApiKeyWorkflow,
} from "@medusajs/medusa/core-flows"

/**
 * Comprehensive Seed Script for Chef Events Platform
 * 
 * This script sets up all necessary infrastructure including:
 * - US Region
 * - Fulfillment sets and service zones
 * - Stock locations
 * - Sales channels (Default + Digital)
 * - Digital shipping profile and options
 * - Publishable API key for storefront
 * - Menu data
 */
export default async function seedMenuData({ container }: ExecArgs) {
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER);

  try {
    logger.info('🚀 Starting Chef Platform seeding...');
    logger.info('');

    // Step 1: Create US Region
    logger.info('📍 Step 1: Setting up US Region...');
    const region = await ensureUSRegion(container, logger);
    logger.info(`✅ US Region ready: ${region.name} (ID: ${region.id})`);
    logger.info('');

    // Step 2: Create Fulfillment Set
    logger.info('📦 Step 2: Setting up Fulfillment Infrastructure...');
    const fulfillmentSet = await ensureFulfillmentSet(container, logger, region);
    logger.info(`✅ Fulfillment Set ready (ID: ${fulfillmentSet.id})`);
    logger.info('');

    // Step 3: Create Stock Location
    logger.info('🏢 Step 3: Setting up Stock Location...');
    const stockLocation = await ensureStockLocation(container, logger);
    logger.info(`✅ Stock Location ready: ${stockLocation.name} (ID: ${stockLocation.id})`);
    logger.info('');

    // Step 4: Create Sales Channels
    logger.info('📺 Step 4: Setting up Sales Channels...');
    const { defaultChannel, digitalChannel } = await ensureSalesChannels(container, logger);
    logger.info(`✅ Default Sales Channel ready: ${defaultChannel.name}`);
    logger.info(`✅ Digital Sales Channel ready: ${digitalChannel.name}`);
    logger.info('');

    // Step 5: Link Stock Location to Sales Channels, Fulfillment Set, and Provider
    logger.info('🔗 Step 5: Linking Stock Location...');
    await linkStockLocationToChannels(container, logger, stockLocation, [defaultChannel, digitalChannel]);
    await linkFulfillmentProvidersToLocation(container, logger, stockLocation);
    await linkStockLocationToFulfillmentSet(container, logger, stockLocation, fulfillmentSet);
    logger.info('✅ Stock location linked to sales channels, fulfillment set, and providers');
    logger.info('');

    // Step 6: Create Digital Shipping Profile and Option
    logger.info('🚚 Step 6: Setting up Digital Shipping...');
    await ensureDigitalShipping(container, logger, fulfillmentSet, region);
    logger.info('✅ Digital shipping ready');
    logger.info('');

    // Step 7: Create Publishable API Key
    logger.info('🔑 Step 7: Setting up Publishable API Key...');
    const apiKey = await ensurePublishableApiKey(container, logger, defaultChannel);
    logger.info(`✅ Publishable API Key ready: ${apiKey.token}`);
    logger.info('');

    // Step 8: Seed Menus
    logger.info('🍽️  Step 8: Seeding Menu Data...');
    const menuModuleService = container.resolve("menuModuleService");
    const createdMenus = await seedMenuEntities(menuModuleService);
    logger.info(`✅ Successfully created ${createdMenus.length} menus:`);
    createdMenus.forEach(menu => {
      logger.info(`   - ${menu.name}`);
    });
    logger.info('');

    logger.info('');
    logger.info('✨ ================================================');
    logger.info('✨ Chef Platform seeding completed successfully!');
    logger.info('✨ ================================================');
    logger.info('');
    logger.info('📋 Summary:');
    logger.info(`   - Region: ${region.name}`);
    logger.info(`   - Stock Location: ${stockLocation.name}`);
    logger.info(`   - Sales Channels: ${defaultChannel.name}, ${digitalChannel.name}`);
    logger.info(`   - Menus: ${createdMenus.length} created`);
    logger.info('');
    logger.info('🎉 Your Medusa application is ready for chef events!');
    logger.info('');
    
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.error(`❌ Error seeding Chef Platform: ${errorMessage}`);
    if (error instanceof Error) {
      logger.error(error.stack || error.message);
    }
    throw error;
  }
}

/**
 * Ensure US Region exists
 */
async function ensureUSRegion(container: any, logger: any) {
  const regionModuleService = container.resolve(Modules.REGION);

  // Check if US region already exists
  const existingRegions = await regionModuleService.listRegions({
    name: "United States"
  });

  if (existingRegions.length > 0) {
    logger.info('   US Region already exists, skipping creation');
    return existingRegions[0];
  }

  // Create US region with Stripe payment provider
  const { result } = await createRegionsWorkflow(container).run({
    input: {
      regions: [
        {
          name: "United States",
          currency_code: "usd",
          countries: ["us"],
          payment_providers: ["pp_stripe_stripe"],
        },
      ],
    },
  });

  return result[0];
}

/**
 * Ensure Fulfillment Set exists
 */
async function ensureFulfillmentSet(container: any, logger: any, region: any) {
  const fulfillmentModuleService = container.resolve(Modules.FULFILLMENT);

  // Check if fulfillment set already exists
  const existingSets = await fulfillmentModuleService.listFulfillmentSets();

  if (existingSets.length > 0 && existingSets[0].service_zones?.length > 0) {
    logger.info('   Fulfillment Set already exists, skipping creation');
    return existingSets[0];
  }

  // Create fulfillment set with service zones and geo zones all in one call
  // This is the pattern from the original seed.ts
  const fulfillmentSet = await fulfillmentModuleService.createFulfillmentSets({
    name: "Default Fulfillment Set",
    type: "shipping",
    service_zones: [
      {
        name: "United States Service Zone",
        geo_zones: [
          {
            country_code: "us",
            type: "country",
          },
        ],
      },
    ],
  });

  return fulfillmentSet;
}

/**
 * Ensure Stock Location exists
 */
async function ensureStockLocation(container: any, logger: any) {
  const stockLocationModuleService = container.resolve(Modules.STOCK_LOCATION);

  // Check if stock location already exists
  const existingLocations = await stockLocationModuleService.listStockLocations({
    name: "Main Warehouse"
  });

  if (existingLocations.length > 0) {
    logger.info('   Stock Location already exists, skipping creation');
    return existingLocations[0];
  }

  // Check for digital location
  const digitalLocations = await stockLocationModuleService.listStockLocations({
    name: "Digital Location"
  });

  if (digitalLocations.length > 0) {
    logger.info('   Digital Location already exists, using it as main location');
    return digitalLocations[0];
  }

  // Create stock location
  const { result } = await createStockLocationsWorkflow(container).run({
    input: {
      locations: [
        {
          name: "Main Warehouse",
          address: {
            address_1: "123 Main Street",
            city: "New York",
            country_code: "US",
            province: "NY",
            postal_code: "10001",
          },
        },
      ],
    },
  });

  return result[0];
}

/**
 * Ensure Sales Channels exist
 */
async function ensureSalesChannels(container: any, logger: any) {
  const salesChannelModuleService = container.resolve(Modules.SALES_CHANNEL);

  // Check for default sales channel
  let defaultChannel;
  const existingDefaultChannels = await salesChannelModuleService.listSalesChannels({
    name: "Default Sales Channel"
  });

  if (existingDefaultChannels.length > 0) {
    logger.info('   Default Sales Channel already exists');
    defaultChannel = existingDefaultChannels[0];
  } else {
    const { result } = await createSalesChannelsWorkflow(container).run({
      input: {
        salesChannelsData: [
          {
            name: "Default Sales Channel",
            description: "Default sales channel for all products",
          },
        ],
      },
    });
    defaultChannel = result[0];
  }

  // Check for digital sales channel
  let digitalChannel;
  const existingDigitalChannels = await salesChannelModuleService.listSalesChannels({
    name: "Digital Sales Channel"
  });

  if (existingDigitalChannels.length > 0) {
    logger.info('   Digital Sales Channel already exists');
    digitalChannel = existingDigitalChannels[0];
  } else {
    const { result } = await createSalesChannelsWorkflow(container).run({
      input: {
        salesChannelsData: [
          {
            name: "Digital Sales Channel",
            description: "Channel for digital products and chef events",
          },
        ],
      },
    });
    digitalChannel = result[0];
  }

  return { defaultChannel, digitalChannel };
}

/**
 * Link Stock Location to Sales Channels
 */
async function linkStockLocationToChannels(
  container: any, 
  logger: any, 
  stockLocation: any, 
  channels: any[]
) {
  await linkSalesChannelsToStockLocationWorkflow(container).run({
    input: {
      id: stockLocation.id,
      add: channels.map(c => c.id),
    },
  });
}

/**
 * Link Fulfillment Providers to Stock Location
 */
async function linkFulfillmentProvidersToLocation(
  container: any,
  logger: any,
  stockLocation: any
) {
  const remoteLink = container.resolve("remoteLink");
  const fulfillmentModuleService = container.resolve(Modules.FULFILLMENT);
  
  // Get the manual provider
  const providers = await fulfillmentModuleService.listFulfillmentProviders({
    is_enabled: true,
  });
  
  const manualProvider = providers.find((p: any) => p.id === 'manual_manual');
  
  if (!manualProvider) {
    throw new Error('Manual fulfillment provider not found');
  }
  
  // Link provider to stock location
  await remoteLink.create([
    {
      [Modules.STOCK_LOCATION]: {
        stock_location_id: stockLocation.id,
      },
      [Modules.FULFILLMENT]: {
        fulfillment_provider_id: manualProvider.id,
      },
    },
  ]);
  
  logger.info(`   Linked manual_manual provider to stock location`);
}

/**
 * Link Stock Location to Fulfillment Set
 */
async function linkStockLocationToFulfillmentSet(
  container: any,
  logger: any,
  stockLocation: any,
  fulfillmentSet: any
) {
  const remoteLink = container.resolve("remoteLink");
  
  // Link stock location to fulfillment set
  await remoteLink.create({
    [Modules.STOCK_LOCATION]: {
      stock_location_id: stockLocation.id,
    },
    [Modules.FULFILLMENT]: {
      fulfillment_set_id: fulfillmentSet.id,
    },
  });
  
  logger.info(`   Linked stock location to fulfillment set`);
}

/**
 * Ensure Publishable API Key exists
 */
async function ensurePublishableApiKey(
  container: any,
  logger: any,
  defaultChannel: any
) {
  const apiKeyModuleService = container.resolve(Modules.API_KEY);
  
  // Check if publishable API key already exists
  const existingKeys = await apiKeyModuleService.listApiKeys({
    type: "publishable",
    title: "Storefront",
  });
  
  if (existingKeys.length > 0) {
    logger.info('   Publishable API Key already exists');
    return existingKeys[0];
  }
  
  // Create publishable API key
  const { result } = await createApiKeysWorkflow(container).run({
    input: {
      api_keys: [
        {
          title: "Storefront",
          type: "publishable",
          created_by: "",
        },
      ],
    },
  });
  
  const apiKey = result[0];
  logger.info(`   Created Publishable API Key`);
  
  // Link API key to default sales channel
  await linkSalesChannelsToApiKeyWorkflow(container).run({
    input: {
      id: apiKey.id,
      add: [defaultChannel.id],
    },
  });
  
  logger.info(`   Linked API Key to Default Sales Channel`);
  
  return apiKey;
}

/**
 * Ensure Digital Shipping Profile and Option exist
 */
async function ensureDigitalShipping(
  container: any, 
  logger: any, 
  fulfillmentSet: any, 
  region: any
) {
  const fulfillmentModuleService = container.resolve(Modules.FULFILLMENT);

  // Check if digital shipping profile already exists
  let digitalShippingProfile;
  const existingProfiles = await fulfillmentModuleService.listShippingProfiles({
    name: "Digital Products"
  });

  if (existingProfiles.length > 0) {
    logger.info('   Digital Shipping Profile already exists');
    digitalShippingProfile = existingProfiles[0];
  } else {
    const { result } = await createShippingProfilesWorkflow(container).run({
      input: {
        data: [
          {
            name: "Digital Products",
            type: "digital",
          },
        ],
      },
    });
    digitalShippingProfile = result[0];
    logger.info('   Created Digital Shipping Profile');
  }

  // Check if digital delivery option already exists
  const existingOptions = await fulfillmentModuleService.listShippingOptions({
    name: "Digital Delivery"
  });

  if (existingOptions.length > 0) {
    logger.info('   Digital Delivery Option already exists');
    return;
  }

  // Log fulfillment set structure for debugging
  logger.info('   Creating Digital Delivery Shipping Option...');
  logger.info(`   Service Zone ID: ${fulfillmentSet.service_zones[0].id}`);
  logger.info(`   Service Zone has ${fulfillmentSet.service_zones[0].fulfillment_providers?.length || 0} providers`);

  // Create digital delivery shipping option
  await createShippingOptionsWorkflow(container).run({
    input: [
      {
        name: 'Digital Delivery',
        price_type: 'flat',
        provider_id: 'manual_manual',
        service_zone_id: fulfillmentSet.service_zones[0].id,
        shipping_profile_id: digitalShippingProfile.id,
        type: {
          label: 'Digital',
          description: 'Instant delivery - No physical shipping required.',
          code: 'digital',
        },
        prices: [
          {
            currency_code: 'usd',
            amount: 0,
          },
          {
            region_id: region.id,
            amount: 0,
          },
        ],
        rules: [
          {
            attribute: 'enabled_in_store',
            value: 'true',
            operator: 'eq',
          },
          {
            attribute: 'is_return',
            value: 'false',
            operator: 'eq',
          },
        ],
      },
    ],
  });

  logger.info('   Created Digital Delivery Shipping Option');
}

