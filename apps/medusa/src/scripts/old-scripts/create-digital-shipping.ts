import { ExecArgs } from "@medusajs/types"
import { Modules, ContainerRegistrationKeys } from "@medusajs/framework/utils"
import { createShippingProfilesWorkflow, createShippingOptionsWorkflow } from "@medusajs/medusa/core-flows"

export default async function createDigitalShipping({ container }: ExecArgs) {
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER)
  const fulfillmentModuleService = container.resolve(Modules.FULFILLMENT)
  const regionModuleService = container.resolve(Modules.REGION)

  logger.info('Creating digital shipping profile...')

  // Check if digital shipping profile already exists
  const existingProfiles = await fulfillmentModuleService.listShippingProfiles({
    name: "Digital Products"
  })

  let digitalShippingProfile

  if (existingProfiles.length > 0) {
    logger.info('Digital shipping profile already exists')
    digitalShippingProfile = existingProfiles[0]
  } else {
    // Create digital shipping profile
    const { result } = await createShippingProfilesWorkflow(container).run({
      input: {
        data: [
          {
            name: "Digital Products",
            type: "digital"
          }
        ]
      }
    })
    digitalShippingProfile = result[0]
    logger.info('Created digital shipping profile')
  }

  // Get existing fulfillment sets and regions
  const fulfillmentSets = await fulfillmentModuleService.listFulfillmentSets()
  const regions = await regionModuleService.listRegions()

  if (fulfillmentSets.length === 0 || regions.length === 0) {
    logger.warn('No fulfillment sets or regions found. Run the main seed script first.')
    return
  }

  const fulfillmentSet = fulfillmentSets[0]
  const usRegion = regions.find(r => r.name === 'United States')
  const caRegion = regions.find(r => r.name === 'Canada')

  if (!fulfillmentSet.service_zones || fulfillmentSet.service_zones.length === 0) {
    logger.warn('No service zones found in fulfillment set')
    return
  }

  // Check if digital delivery option already exists
  const existingOptions = await fulfillmentModuleService.listShippingOptions({
    name: "Digital Delivery"
  })

  if (existingOptions.length > 0) {
    logger.info('Digital delivery shipping option already exists')
    return
  }

  logger.info('Creating digital delivery shipping option...')

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
            currency_code: 'cad',
            amount: 0,
          },
          ...(usRegion ? [{
            region_id: usRegion.id,
            amount: 0,
          }] : []),
          ...(caRegion ? [{
            region_id: caRegion.id,
            amount: 0,
          }] : []),
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
  })

  logger.info('Successfully created digital shipping profile and option!')
} 