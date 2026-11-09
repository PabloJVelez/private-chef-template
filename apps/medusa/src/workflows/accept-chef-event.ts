import { DateTime } from 'luxon';
import { requireSlot } from '../lib/availability/query';
/**
 * Accept Chef Event Workflow
 *
 * Handles acceptance of chef event requests and creates corresponding
 * digital event-ticket products. Steps:
 *
 * 1. Revalidate and atomically claim occupied time while the request remains pending
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

import { MedusaError, Modules } from '@medusajs/framework/utils';
import {
  deleteProductsWorkflow,
  createShippingOptionsWorkflow,
  createShippingProfilesWorkflow,
  createStockLocationsWorkflow,
  emitEventStep,
  linkSalesChannelsToStockLocationWorkflow,
} from '@medusajs/medusa/core-flows';
import { StepResponse, WorkflowResponse, createStep, createWorkflow, when } from '@medusajs/workflows-sdk';
import { CHEF_EVENT_MODULE } from '../modules/chef-event';
import ChefEventModuleService from '../modules/chef-event/service';

import { SCHEDULING_MODULE } from '../modules/scheduling';
import SchedulingModuleService from '../modules/scheduling/service';
import {
  recoverEventProduct,
  eventProductExecution,
  bookingStepConfig,
  withEventProductLock,
  eventProductWorkflow,
  assertEventProductAbsent,
} from '../lib/booking-execution';

export type AcceptChefEventWorkflowInput = {
  attemptId: string;
  chefEventId: string;
  chefNotes?: string;
  acceptedBy?: string;
  sendAcceptanceEmail?: boolean;
};

type ChefEventData = {
  id: string;
  eventType: string;
  requestedDate: Date;
  requestedTime: string;
  partySize: number;
  firstName: string;
  lastName: string;
  locationAddress: string;
  totalPrice?: number | string;
};

const acceptChefEventStep = createStep(
  { name: 'accept-chef-event-step', ...bookingStepConfig },
  async (input: AcceptChefEventWorkflowInput, { container }: { container: any }) => {
    // Serialize claim/acquire with explicit abort so cleanup cannot finish ahead of a late acquire.
    return withEventProductLock(container, input.attemptId, async () => {
      const chefEventModuleService: ChefEventModuleService = container.resolve(CHEF_EVENT_MODULE);

      const originalChefEvent = await chefEventModuleService.retrieveChefEvent(input.chefEventId);

      const token = input.attemptId;
      const attempt = await chefEventModuleService.retrieveAcceptanceAttempt(token);
      if (
        attempt.event_id === originalChefEvent.id &&
        attempt.state === 'finalized' &&
        originalChefEvent.acceptanceExecution === token &&
        ['confirmed', 'completed'].includes(originalChefEvent.status)
      )
        return new StepResponse({ originalChefEvent, token, input }, { id: originalChefEvent.id, token });
      if (attempt.event_id !== originalChefEvent.id || attempt.state !== 'active')
        throw new Error('Acceptance attempt is no longer active.');
      if (
        originalChefEvent.acceptanceExecution !== token ||
        originalChefEvent.status !== 'pending' ||
        originalChefEvent.productId ||
        (originalChefEvent.acceptanceToken && originalChefEvent.acceptanceToken !== token)
      )
        throw new Error('Only an unclaimed pending request can be accepted. Reload the event.');
      if (originalChefEvent.acceptanceToken === token) {
        await container.resolve(SCHEDULING_MODULE).acquire({
          id: token,
          ownerId: originalChefEvent.id,
          attemptId: token,
          start: new Date(originalChefEvent.occupiedStart!).toISOString(),
          end: new Date(originalChefEvent.occupiedEnd!).toISOString(),
        });
        return new StepResponse({ originalChefEvent, token, input }, { id: originalChefEvent.id, token });
      }
      if (!originalChefEvent.experience_type_id)
        throw new Error('Select an experience before accepting this legacy request.');
      const date = DateTime.fromJSDate(new Date(originalChefEvent.requestedDate))
        .setZone(originalChefEvent.timeZone)
        .toISODate()!;
      const { slot, experience, timezone } = await requireSlot(
        container,
        date,
        originalChefEvent.experience_type_id,
        new Date(originalChefEvent.requestedDate).toISOString(),
        originalChefEvent.id,
      );
      if (slot.time !== originalChefEvent.requestedTime)
        throw new Error('The chef timezone changed. Update the request before accepting.');
      await chefEventModuleService.claimAcceptance({
        id: originalChefEvent.id,
        token,
        updatedAt: originalChefEvent.updated_at,
        start: slot.occupiedStart,
        end: slot.occupiedEnd,
        snapshot: {
          timezone,
          duration_minutes: experience.duration_minutes,
          preparation_minutes: experience.preparation_minutes,
          travel_minutes: experience.travel_minutes,
          cleanup_minutes: experience.cleanup_minutes,
        },
      });
      try {
        await container.resolve(SCHEDULING_MODULE).acquire({
          id: token,
          ownerId: originalChefEvent.id,
          attemptId: token,
          start: slot.occupiedStart,
          end: slot.occupiedEnd,
        });
      } catch (error) {
        // An overlap rejection has a definite outcome. Unknown outcomes retain the event claim for recovery.
        if ((error as { code?: string }).code === '23P01') {
          await chefEventModuleService.releaseAcceptance(originalChefEvent.id, token);
          await chefEventModuleService.completeAcceptanceCleanup(originalChefEvent.id, token);
        }
        throw error;
      }
      return new StepResponse({ originalChefEvent, token, input }, { id: originalChefEvent.id, token });
    });
  },
  async (claim, { container }) => {
    if (!claim) return;
    // Serialize the absence check with creation/abort. A lost response never proves product absence.
    return withEventProductLock(container, claim.token, async () => {
      await assertEventProductAbsent(container, claim.token, claim.id);
      const chef = container.resolve<ChefEventModuleService>(CHEF_EVENT_MODULE);
      if (await chef.releaseAcceptance(claim.id, claim.token)) {
        await container.resolve<SchedulingModuleService>(SCHEDULING_MODULE).release({
          id: claim.token,
          ownerId: claim.id,
          attemptId: claim.token,
        });
        await chef.completeAcceptanceCleanup(claim.id, claim.token);
      }
    });
  },
);

const ensureDigitalShippingProfileStep = createStep(
  { name: 'ensure-digital-shipping-profile-step', ...bookingStepConfig },
  async (input: {}, { container }: { container: any }) => {
    const fulfillmentModuleService = container.resolve(Modules.FULFILLMENT);

    const existingProfiles = await fulfillmentModuleService.listShippingProfiles({
      name: 'Digital Products',
    });

    if (existingProfiles.length > 0) {
      return new StepResponse(existingProfiles[0]);
    }

    const { result } = await createShippingProfilesWorkflow(container).run({
      input: {
        data: [
          {
            name: 'Digital Products',
            type: 'digital',
          },
        ],
      },
    });

    return new StepResponse(result[0]);
  },
);

const ensureDigitalShippingOptionStep = createStep(
  { name: 'ensure-digital-shipping-option-step', ...bookingStepConfig },
  async (input: { digitalShippingProfile: any }, { container }: { container: any }) => {
    const fulfillmentModuleService = container.resolve(Modules.FULFILLMENT);
    const regionModuleService = container.resolve(Modules.REGION);
    const logger = container.resolve('logger');

    const existingOptions = await fulfillmentModuleService.listShippingOptions({
      name: 'Digital Delivery',
    });

    if (existingOptions.length > 0) {
      return new StepResponse(existingOptions[0]);
    }

    const fulfillmentSets = await fulfillmentModuleService.listFulfillmentSets();
    const regions = await regionModuleService.listRegions();

    if (fulfillmentSets.length === 0 || !fulfillmentSets[0].service_zones?.length) {
      logger.warn('No fulfillment sets or service zones found. Skipping digital shipping option creation.');
      logger.warn('Please run the init script first: npx medusa db:seed -f ./src/scripts/init.ts');
      return new StepResponse(null);
    }

    const fulfillmentSet = fulfillmentSets[0];
    const usRegion = regions.find((r: any) => r.name === 'United States');
    const caRegion = regions.find((r: any) => r.name === 'Canada');

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
    });

    return new StepResponse(result[0]);
  },
);

const resolveStoreDefaultSalesChannelStep = createStep(
  { name: 'resolve-store-default-sales-channel-step', ...bookingStepConfig },
  async (input: {}, { container }: { container: any }) => {
    const storeModuleService = container.resolve(Modules.STORE);
    const salesChannelModuleService = container.resolve(Modules.SALES_CHANNEL);

    const [store] = await storeModuleService.listStores();

    if (store?.default_sales_channel_id) {
      const channel = await salesChannelModuleService.retrieveSalesChannel(store.default_sales_channel_id);
      return new StepResponse(channel);
    }

    const [fallback] = await salesChannelModuleService.listSalesChannels({
      name: 'Default Sales Channel',
    });
    if (fallback) {
      return new StepResponse(fallback);
    }

    throw new Error('No default sales channel found. Run the init script first.');
  },
);

const ensureDigitalLocationStep = createStep(
  { name: 'ensure-digital-location-step', ...bookingStepConfig },
  async (input: {}, { container }: { container: any }) => {
    const stockLocationModuleService = container.resolve(Modules.STOCK_LOCATION);

    const existingLocations = await stockLocationModuleService.listStockLocations({
      name: 'Digital Location',
    });

    if (existingLocations.length > 0) {
      return new StepResponse(existingLocations[0]);
    }

    const { result } = await createStockLocationsWorkflow(container).run({
      input: {
        locations: [
          {
            name: 'Digital Location',
            address: {
              city: 'Digital',
              country_code: 'US',
              province: 'Digital',
              address_1: 'Digital Product Location',
              postal_code: '00000',
            },
          },
        ],
      },
    });

    return new StepResponse(result[0]);
  },
);

const linkDigitalLocationToSalesChannelStep = createStep(
  { name: 'link-digital-location-to-sales-channel-step', ...bookingStepConfig },
  async (input: { digitalLocation: any; defaultSalesChannel: any }, { container }: { container: any }) => {
    await linkSalesChannelsToStockLocationWorkflow(container).run({
      input: {
        id: input.digitalLocation.id,
        add: [input.defaultSalesChannel.id],
      },
    });

    return new StepResponse({
      digitalLocation: input.digitalLocation,
      defaultSalesChannel: input.defaultSalesChannel,
    });
  },
);

const createEventProductStep = createStep(
  { name: 'create-event-product-step', ...bookingStepConfig },
  async (
    input: {
      originalChefEvent: ChefEventData;
      token: string;
      digitalShippingProfile: any;
      defaultSalesChannel: any;
      digitalLocation: any;
    },
    { container }: { container: any },
  ) => {
    return withEventProductLock(container, input.token, async () => {
      const attempt = await container.resolve(CHEF_EVENT_MODULE).retrieveAcceptanceAttempt(input.token);
      if (attempt.event_id !== input.originalChefEvent.id || attempt.state === 'aborted')
        throw new Error('Acceptance attempt was aborted.');
      const logger = container.resolve('logger');
      const chefEvent = input.originalChefEvent;

      function getEventTypeLabel(eventType: string): string {
        const eventTypeLabels: Record<string, string> = {
          cooking_class: 'Cooking Class',
          plated_dinner: 'Plated Dinner',
          buffet_style: 'Buffet Style',
        };
        return eventTypeLabels[eventType] || eventType;
      }

      function calculatePricePerPerson(chefEvent: ChefEventData): number {
        const total = Number(chefEvent.totalPrice);
        if (Number.isFinite(total) && total > 0 && chefEvent.partySize > 0) {
          return total / chefEvent.partySize;
        }
        const pricing: Record<string, number> = {
          cooking_class: 119.99,
          plated_dinner: 149.99,
          buffet_style: 99.99,
        };
        return pricing[chefEvent.eventType] ?? pricing.plated_dinner;
      }

      function createUrlSafeHandle(chefEvent: ChefEventData): string {
        const eventType = chefEvent.eventType
          .replace(/[^a-zA-Z0-9]+/g, '-')
          .replace(/-+/g, '-')
          .toLowerCase();
        const date = new Date(chefEvent.requestedDate).toISOString().split('T')[0];
        const customerName = `${chefEvent.firstName}-${chefEvent.lastName}`
          .toLowerCase()
          .replace(/[^a-z0-9-]/g, '');
        return `event-${eventType}-${customerName}-${date}`;
      }

      const pricePerPerson = calculatePricePerPerson(chefEvent);
      const eventTypeSkuPart = chefEvent.eventType
        .replace(/[^a-zA-Z0-9]+/g, '-')
        .replace(/-+/g, '-')
        .toLowerCase()
        .slice(0, 40);

      const creation = eventProductWorkflow(container);
      await recoverEventProduct(container, input.token, chefEvent.id);
      const { result, transaction } = await creation.run({
        context: { transactionId: eventProductExecution(input.token) },
        input: {
          eventId: chefEvent.id,
          attemptId: input.token,
          products: [
            {
              title: `${getEventTypeLabel(chefEvent.eventType)} - ${chefEvent.firstName} ${chefEvent.lastName} - ${new Date(chefEvent.requestedDate).toLocaleDateString()}`,
              handle: `${createUrlSafeHandle(chefEvent)}-${chefEvent.id}`,
              description: `Private chef event for ${chefEvent.firstName} ${chefEvent.lastName} on ${new Date(chefEvent.requestedDate).toLocaleDateString()} at ${chefEvent.requestedTime}. Event type: ${getEventTypeLabel(chefEvent.eventType)}. Location: ${chefEvent.locationAddress}.`,
              status: 'draft',
              external_id: eventProductExecution(input.token),
              metadata: {
                acceptance_attempt: input.token,
                chef_event_id: chefEvent.id,
              },
              shipping_profile_id: input.digitalShippingProfile.id,
              sales_channels: [{ id: input.defaultSalesChannel.id }],
              options: [
                {
                  title: 'Ticket Type',
                  values: ['Event Ticket'],
                },
              ],
              variants: [
                {
                  title: 'Event Ticket',
                  sku: `EVENT-${chefEvent.id}-${new Date(chefEvent.requestedDate).toISOString().split('T')[0]}-${eventTypeSkuPart}`,
                  manage_inventory: true,
                  options: {
                    'Ticket Type': 'Event Ticket',
                  },
                  prices: [
                    {
                      amount: pricePerPerson,
                      currency_code: 'usd',
                    },
                  ],
                },
              ],
            },
          ],
        },
      });

      if (!transaction.hasFinished() || !result?.[0])
        throw new Error('Product creation is awaiting native recovery; protected time is retained.');
      const product = result[0];

      try {
        const inventoryModuleService = container.resolve(Modules.INVENTORY);
        const inventoryItems = [];

        for (const variant of product.variants) {
          try {
            const existingInventoryItems = await inventoryModuleService.listInventoryItems({
              sku: variant.sku,
            });

            let inventoryItem;

            if (existingInventoryItems.length > 0) {
              inventoryItem = existingInventoryItems[0];
            } else {
              inventoryItem = await inventoryModuleService.createInventoryItems({
                sku: variant.sku,
                origin_country: 'US',
                hs_code: '',
                mid_code: '',
                material: '',
                weight: 0,
                length: 0,
                height: 0,
                width: 0,
                requires_shipping: false,
                description: `Digital ticket for ${variant.title}`,
                title: variant.title,
              });
            }

            // Medusa's createProductVariantsWorkflow already linked this SKU to an inventory row
            // with requires_shipping: true. Reusing that row by SKU leaves the wrong flag — fix it.
            if (inventoryItem.requires_shipping !== false) {
              inventoryItem = await inventoryModuleService.updateInventoryItems({
                id: inventoryItem.id,
                requires_shipping: false,
              });
            }

            const existingLevels = await inventoryModuleService.listInventoryLevels({
              inventory_item_id: inventoryItem.id,
              location_id: input.digitalLocation.id,
            });

            if (existingLevels.length === 0) {
              await inventoryModuleService.createInventoryLevels({
                inventory_item_id: inventoryItem.id,
                location_id: input.digitalLocation.id,
                stocked_quantity: input.originalChefEvent.partySize,
                reserved_quantity: 0,
              });
            }
            inventoryItems.push(inventoryItem);
          } catch (error) {
            logger.error(
              `Error processing inventory for variant ${variant.title}: ${error instanceof Error ? error.message : String(error)}`,
            );
            throw error;
          }
        }

        return new StepResponse(
          { product, inventoryItems },
          { productId: product.id, eventId: chefEvent.id, token: input.token },
        );
      } catch (error) {
        // Retrying inventory setup reuses the retained native product execution.
        throw error;
      }
    });
  },
  async (data, { container }) => {
    if (!data) return;
    return withEventProductLock(container, data.token, async () => {
      const product = await container
        .resolve(Modules.PRODUCT)
        .retrieveProduct(data.productId)
        .catch((error: { type?: string }) => {
          if (error.type !== MedusaError.Types.NOT_FOUND) throw error;
          return null;
        });
      if (!product) return;
      if (
        product.metadata?.acceptance_attempt !== data.token ||
        product.metadata?.chef_event_id !== data.eventId
      )
        throw new Error('Product ownership does not match this acceptance attempt.');
      // The conditional abort prevents a concurrent or stale finalizer from winning after cleanup starts.
      if (
        await container
          .resolve<ChefEventModuleService>(CHEF_EVENT_MODULE)
          .releaseAcceptance(data.eventId, data.token)
      )
        await deleteProductsWorkflow(container).run({
          input: { ids: [data.productId] },
        });
    });
  },
);

const linkChefEventToProductStep = createStep(
  { name: 'link-chef-event-to-product-step', ...bookingStepConfig },
  async (
    input: {
      originalChefEvent: ChefEventData;
      product: any;
      token: string;
      acceptance: AcceptChefEventWorkflowInput;
    },
    { container }: { container: any },
  ) => {
    const chefEventModuleService: ChefEventModuleService = container.resolve(CHEF_EVENT_MODULE);

    const updatedChefEvent = await chefEventModuleService.finalizeAcceptance({
      id: input.originalChefEvent.id,
      token: input.token,
      productId: input.product.id,
      acceptedBy: input.acceptance.acceptedBy,
      chefNotes: input.acceptance.chefNotes,
      sendAcceptanceEmail: input.acceptance.sendAcceptanceEmail,
    });
    // Both held and confirmed reservations protect time if interrupted between these module commits.
    await (container.resolve(SCHEDULING_MODULE) as SchedulingModuleService).confirm({
      id: input.token,
      ownerId: input.originalChefEvent.id,
      attemptId: input.token,
    });
    await container.resolve(Modules.PRODUCT).updateProducts(input.product.id, { status: 'published' });

    return new StepResponse(updatedChefEvent);
  },
);

export const acceptChefEventWorkflow = createWorkflow(
  { name: 'accept-chef-event-workflow', store: true, idempotent: true },
  function (input: AcceptChefEventWorkflowInput) {
    const chefEventData = acceptChefEventStep(input);
    const digitalShippingProfile = ensureDigitalShippingProfileStep();
    const digitalShippingOption = ensureDigitalShippingOptionStep({
      digitalShippingProfile,
    });
    const defaultSalesChannel = resolveStoreDefaultSalesChannelStep();
    const digitalLocation = ensureDigitalLocationStep();
    const linkedLocation = linkDigitalLocationToSalesChannelStep({
      digitalLocation,
      defaultSalesChannel,
    });
    const productAndInventory = createEventProductStep({
      originalChefEvent: chefEventData.originalChefEvent,
      token: chefEventData.token,
      digitalShippingProfile,
      defaultSalesChannel: linkedLocation.defaultSalesChannel,
      digitalLocation: linkedLocation.digitalLocation,
    });
    const linkedChefEvent = linkChefEventToProductStep({
      originalChefEvent: chefEventData.originalChefEvent,
      product: productAndInventory.product,
      token: chefEventData.token,
      acceptance: input,
    });

    when('send-acceptance-email', { input }, ({ input }) => input.sendAcceptanceEmail !== false).then(() => {
      emitEventStep({
        eventName: 'chef-event.accepted',
        data: {
          chefEventId: linkedChefEvent.id,
          productId: productAndInventory.product.id,
        },
      }).config({ name: 'emit-chef-event-accepted', ...bookingStepConfig });
    });

    // Always sync acceptance updates (status/color/details) to Google Calendar.
    emitEventStep({
      eventName: 'google-calendar.sync-requested',
      data: {
        chefEventId: linkedChefEvent.id,
        operation: 'upsert',
      },
    }).config({
      name: 'emit-google-calendar-sync-on-chef-event-accept',
      ...bookingStepConfig,
    });

    return new WorkflowResponse({
      success: true,
      chefEventId: linkedChefEvent.id,
      productId: productAndInventory.product.id,
      emailSent: input.sendAcceptanceEmail ?? true,
    });
  },
);
