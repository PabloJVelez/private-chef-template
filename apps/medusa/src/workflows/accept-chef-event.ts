/**
 * Accept Chef Event Workflow
 *
 * Handles acceptance of chef event requests and creates corresponding
 * digital event-ticket products. Steps:
 *
 * 1. Update chef event status to 'confirmed'
 * 2. Ensure digital shipping profile & shipping option exist
 * 3. Resolve the store's default sales channel (set by init script)
 * 4. Ensure "Digital Location" stock location exists
 * 5. Create event product assigned to the default sales channel
 * 6. Create inventory items (requires_shipping: false) at Digital Location
 * 7. Link chef event to created product
 * 8. Emit acceptance event (for email, if enabled)
 *
 * Digital product behavior (no-shipping checkout, $0 delivery) is driven
 * entirely by the "Digital Products" shipping profile + "Digital Delivery"
 * shipping option + inventory requires_shipping: false — not by sales channels.
 */

import { 
  createStep,
  createWorkflow,
  StepResponse,
  WorkflowResponse
} from "@medusajs/workflows-sdk"
import { emitEventStep, createProductsWorkflow, createShippingProfilesWorkflow, createStockLocationsWorkflow, linkSalesChannelsToStockLocationWorkflow, createShippingOptionsWorkflow } from "@medusajs/medusa/core-flows"
import { CHEF_EVENT_MODULE } from "../modules/chef-event"
import ChefEventModuleService from "../modules/chef-event/service"
import { Modules } from "@medusajs/framework/utils"

type AcceptChefEventWorkflowInput = {
  chefEventId: string
  chefNotes?: string
  acceptedBy?: string
  sendAcceptanceEmail?: boolean
}

type ChefEventData = {
  id: string
  eventType: 'cooking_class' | 'plated_dinner' | 'buffet_style'
  requestedDate: Date
  requestedTime: string
  partySize: number
  firstName: string
  lastName: string
  locationAddress: string
}

const acceptChefEventStep = createStep(
  "accept-chef-event-step",
  async (input: AcceptChefEventWorkflowInput, { container }: { container: any }) => {
    const chefEventModuleService: ChefEventModuleService = container.resolve(CHEF_EVENT_MODULE)
    
    const originalChefEvent = await chefEventModuleService.retrieveChefEvent(input.chefEventId)
    
    const updatedChefEvent = await chefEventModuleService.updateChefEvents({
      id: input.chefEventId,
      status: 'confirmed',
      acceptedAt: new Date(),
      acceptedBy: input.acceptedBy || 'chef',
      chefNotes: input.chefNotes,
      sendAcceptanceEmail: input.sendAcceptanceEmail ?? true
    })
    
    return new StepResponse({
      updatedChefEvent,
      originalChefEvent
    })
  }
)

const ensureDigitalShippingProfileStep = createStep(
  "ensure-digital-shipping-profile-step",
  async (input: {}, { container }: { container: any }) => {
    const fulfillmentModuleService = container.resolve(Modules.FULFILLMENT)
    
    const existingProfiles = await fulfillmentModuleService.listShippingProfiles({
      name: "Digital Products"
    })
    
    if (existingProfiles.length > 0) {
      return new StepResponse(existingProfiles[0])
    }
    
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
    
    return new StepResponse(result[0])
  }
)

const ensureDigitalShippingOptionStep = createStep(
  "ensure-digital-shipping-option-step",
  async (input: { digitalShippingProfile: any }, { container }: { container: any }) => {
    const fulfillmentModuleService = container.resolve(Modules.FULFILLMENT)
    const regionModuleService = container.resolve(Modules.REGION)
    const logger = container.resolve("logger")
    
    const existingOptions = await fulfillmentModuleService.listShippingOptions({
      name: "Digital Delivery"
    })
    
    if (existingOptions.length > 0) {
      return new StepResponse(existingOptions[0])
    }
    
    const fulfillmentSets = await fulfillmentModuleService.listFulfillmentSets()
    const regions = await regionModuleService.listRegions()
    
    if (fulfillmentSets.length === 0 || !fulfillmentSets[0].service_zones?.length) {
      logger.warn('No fulfillment sets or service zones found. Skipping digital shipping option creation.')
      logger.warn('Please run the init script first: npx medusa db:seed -f ./src/scripts/init.ts')
      return new StepResponse(null)
    }
    
    const fulfillmentSet = fulfillmentSets[0]
    const usRegion = regions.find((r: any) => r.name === 'United States')
    const caRegion = regions.find((r: any) => r.name === 'Canada')
    
    const { result } = await createShippingOptionsWorkflow(container).run({
      input: [
        {
          name: 'Digital Delivery',
          price_type: 'flat',
          provider_id: 'manual_manual',
          service_zone_id: fulfillmentSet.service_zones[0].id,
          shipping_profile_id: input.digitalShippingProfile.id,
          type: {
            label: 'Digital',
            description: 'Instant delivery - No physical shipping required.',
            code: 'digital',
          },
          prices: [
            { currency_code: 'usd', amount: 0 },
            { currency_code: 'cad', amount: 0 },
            ...(usRegion ? [{ region_id: usRegion.id, amount: 0 }] : []),
            ...(caRegion ? [{ region_id: caRegion.id, amount: 0 }] : []),
          ],
          rules: [
            { attribute: 'enabled_in_store', value: 'true', operator: 'eq' },
            { attribute: 'is_return', value: 'false', operator: 'eq' },
          ],
        },
      ],
    })
    
    return new StepResponse(result[0])
  }
)

const resolveStoreDefaultSalesChannelStep = createStep(
  "resolve-store-default-sales-channel-step",
  async (input: {}, { container }: { container: any }) => {
    const storeModuleService = container.resolve(Modules.STORE)
    const salesChannelModuleService = container.resolve(Modules.SALES_CHANNEL)

    const [store] = await storeModuleService.listStores()

    if (store?.default_sales_channel_id) {
      const channel = await salesChannelModuleService.retrieveSalesChannel(store.default_sales_channel_id)
      return new StepResponse(channel)
    }

    const [fallback] = await salesChannelModuleService.listSalesChannels({ name: "Default Sales Channel" })
    if (fallback) {
      return new StepResponse(fallback)
    }

    throw new Error("No default sales channel found. Run the init script first.")
  }
)

const ensureDigitalLocationStep = createStep(
  "ensure-digital-location-step",
  async (input: {}, { container }: { container: any }) => {
    const stockLocationModuleService = container.resolve(Modules.STOCK_LOCATION)
    
    const existingLocations = await stockLocationModuleService.listStockLocations({
      name: "Digital Location"
    })
    
    if (existingLocations.length > 0) {
      return new StepResponse(existingLocations[0])
    }
    
    const { result } = await createStockLocationsWorkflow(container).run({
      input: {
        locations: [
          {
            name: "Digital Location",
            address: {
              city: "Digital",
              country_code: "US",
              province: "Digital",
              address_1: "Digital Product Location",
              postal_code: "00000",
            },
          },
        ],
      },
    })
    
    return new StepResponse(result[0])
  }
)

const linkDigitalLocationToSalesChannelStep = createStep(
  "link-digital-location-to-sales-channel-step",
  async (input: { digitalLocation: any, defaultSalesChannel: any }, { container }: { container: any }) => {
    await linkSalesChannelsToStockLocationWorkflow(container).run({
      input: {
        id: input.digitalLocation.id,
        add: [input.defaultSalesChannel.id]
      }
    })
    
    return new StepResponse({
      digitalLocation: input.digitalLocation,
      defaultSalesChannel: input.defaultSalesChannel
    })
  }
)

const createEventProductStep = createStep(
  "create-event-product-step",
  async (input: { originalChefEvent: ChefEventData, digitalShippingProfile: any, defaultSalesChannel: any, digitalLocation: any }, { container }: { container: any }) => {
    const logger = container.resolve("logger")
    const chefEvent = input.originalChefEvent
    
    function getEventTypeLabel(eventType: ChefEventData['eventType']): string {
      const eventTypeLabels: Record<ChefEventData['eventType'], string> = {
        'cooking_class': 'Cooking Class',
        'plated_dinner': 'Plated Dinner',
        'buffet_style': 'Buffet Style'
      }
      return eventTypeLabels[eventType]
    }

    function calculatePricePerPerson(chefEvent: ChefEventData): number {
      const pricing: Record<ChefEventData['eventType'], number> = {
        'cooking_class': 119.99,
        'plated_dinner': 149.99,
        'buffet_style': 99.99
      }
      return pricing[chefEvent.eventType]
    }

    function createUrlSafeHandle(chefEvent: ChefEventData): string {
      const eventType = chefEvent.eventType.replace('_', '-')
      const date = new Date(chefEvent.requestedDate).toISOString().split('T')[0]
      const customerName = `${chefEvent.firstName}-${chefEvent.lastName}`.toLowerCase().replace(/[^a-z0-9-]/g, '')
      return `event-${eventType}-${customerName}-${date}`
    }
    
    const pricePerPerson = calculatePricePerPerson(chefEvent)
    
    const { result } = await createProductsWorkflow(container).run({
      input: {
        products: [{
          title: `${getEventTypeLabel(chefEvent.eventType)} - ${chefEvent.firstName} ${chefEvent.lastName} - ${new Date(chefEvent.requestedDate).toLocaleDateString()}`,
          handle: createUrlSafeHandle(chefEvent),
          description: `Private chef event for ${chefEvent.firstName} ${chefEvent.lastName} on ${new Date(chefEvent.requestedDate).toLocaleDateString()} at ${chefEvent.requestedTime}. Event type: ${getEventTypeLabel(chefEvent.eventType)}. Location: ${chefEvent.locationAddress}.`,
          status: 'published',
          shipping_profile_id: input.digitalShippingProfile.id,
          sales_channels: [
            { id: input.defaultSalesChannel.id },
          ],
          options: [
            {
              title: 'Ticket Type',
              values: ['Event Ticket']
            }
          ],
          variants: [{
            title: 'Event Ticket',
            sku: `EVENT-${chefEvent.id}-${new Date(chefEvent.requestedDate).toISOString().split('T')[0]}-${chefEvent.eventType}`,
            manage_inventory: true,
            options: {
              'Ticket Type': 'Event Ticket'
            },
            prices: [{
              amount: pricePerPerson,
              currency_code: 'usd'
            }]
          }]
        }]
      }
    })
    
    const product = result[0]
    
    const inventoryModuleService = container.resolve(Modules.INVENTORY)
    const inventoryItems = []
    
    for (const variant of product.variants) {
      try {
        const existingInventoryItems = await inventoryModuleService.listInventoryItems({
          sku: variant.sku
        })
        
        let inventoryItem
        
        if (existingInventoryItems.length > 0) {
          inventoryItem = existingInventoryItems[0]
        } else {
          inventoryItem = await inventoryModuleService.createInventoryItems({
            sku: variant.sku,
            origin_country: "US",
            hs_code: "",
            mid_code: "",
            material: "",
            weight: 0,
            length: 0,
            height: 0,
            width: 0,
            requires_shipping: false,
            description: `Digital ticket for ${variant.title}`,
            title: variant.title,
          })
        }
        
        const existingLevels = await inventoryModuleService.listInventoryLevels({
          inventory_item_id: inventoryItem.id,
          location_id: input.digitalLocation.id
        })
        
        if (existingLevels.length === 0) {
          await inventoryModuleService.createInventoryLevels({
            inventory_item_id: inventoryItem.id,
            location_id: input.digitalLocation.id,
            stocked_quantity: input.originalChefEvent.partySize,
            reserved_quantity: 0,
          })
        }
        inventoryItems.push(inventoryItem)
        
      } catch (error) {
        logger.error(`Error processing inventory for variant ${variant.title}: ${error instanceof Error ? error.message : String(error)}`)
        throw error
      }
    }
    
    return new StepResponse({
      product: product,
      inventoryItems: inventoryItems
    })
  }
)

const linkChefEventToProductStep = createStep(
  "link-chef-event-to-product-step",
  async (input: { originalChefEvent: ChefEventData, product: any }, { container }: { container: any }) => {
    const chefEventModuleService: ChefEventModuleService = container.resolve(CHEF_EVENT_MODULE)
    
    const updatedChefEvent = await chefEventModuleService.updateChefEvents({
      id: input.originalChefEvent.id,
      productId: input.product.id
    })
    
    return new StepResponse(updatedChefEvent)
  }
)

export const acceptChefEventWorkflow = createWorkflow(
  "accept-chef-event-workflow",
  function (input: AcceptChefEventWorkflowInput) {
    const chefEventData = acceptChefEventStep(input)
    const digitalShippingProfile = ensureDigitalShippingProfileStep()
    const digitalShippingOption = ensureDigitalShippingOptionStep({ digitalShippingProfile })
    const defaultSalesChannel = resolveStoreDefaultSalesChannelStep()
    const digitalLocation = ensureDigitalLocationStep()
    const linkedLocation = linkDigitalLocationToSalesChannelStep({
      digitalLocation,
      defaultSalesChannel
    })
    const productAndInventory = createEventProductStep({ 
      originalChefEvent: chefEventData.originalChefEvent,
      digitalShippingProfile,
      defaultSalesChannel: linkedLocation.defaultSalesChannel,
      digitalLocation: linkedLocation.digitalLocation
    })
    const linkedChefEvent = linkChefEventToProductStep({ 
      originalChefEvent: chefEventData.originalChefEvent, 
      product: productAndInventory.product
    })
    
    if (input.sendAcceptanceEmail ?? true) {
      emitEventStep({
        eventName: "chef-event.accepted",
        data: {
          chefEventId: linkedChefEvent.id,
          productId: productAndInventory.product.id
        }
      })
    }
    
    return new WorkflowResponse({
      success: true,
      chefEventId: linkedChefEvent.id,
      productId: productAndInventory.product.id,
      emailSent: input.sendAcceptanceEmail ?? true
    })
  }
)
