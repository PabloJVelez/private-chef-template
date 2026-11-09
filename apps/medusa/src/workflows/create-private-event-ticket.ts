import type { CreateProductWorkflowInputDTO } from '@medusajs/framework/types';
import { MedusaError, Modules, ProductWorkflowEvents } from '@medusajs/framework/utils';
import { createStep, createWorkflow, transform, WorkflowResponse } from '@medusajs/framework/workflows-sdk';
import {
  createProductsStep,
  createProductVariantsWorkflow,
  associateProductsWithSalesChannelsStep,
  createRemoteLinkStep,
  emitEventStep,
  validateProductInputStep,
} from '@medusajs/medusa/core-flows';

interface TicketInput {
  eventId: string;
  attemptId: string;
  products: CreateProductWorkflowInputDTO[];
}

const validateOwner = createStep('validate-private-event-ticket-owner', async (input: TicketInput) => {
  const product = input.products[0];
  if (
    input.products.length !== 1 ||
    product.external_id !== `ticket-${input.attemptId}` ||
    product.metadata?.acceptance_attempt !== input.attemptId ||
    product.metadata?.chef_event_id !== input.eventId
  )
    throw new MedusaError(
      MedusaError.Types.NOT_ALLOWED,
      'Product input does not belong to this event acceptance.',
    );
});

/**
 * The core 2.7 product workflow is not stored by default. This small composition uses its
 * native product, variant, pricing/inventory and link steps under a separately persisted name.
 * It neither changes global core-workflow options nor replaces native commerce services.
 */
export const createPrivateEventTicketWorkflow = createWorkflow(
  { name: 'create-private-event-ticket', store: true, idempotent: true },
  function (input: TicketInput) {
    validateOwner(input);
    validateProductInputStep({ products: input.products });
    const products = createProductsStep(
      transform({ input }, ({ input }) =>
        input.products.map((product) => ({
          ...product,
          sales_channels: undefined,
          shipping_profile_id: undefined,
          variants: undefined,
        })),
      ),
    );
    associateProductsWithSalesChannelsStep({
      links: transform({ input, products }, ({ input, products }) =>
        (input.products[0].sales_channels || []).map((channel) => ({
          product_id: products[0].id,
          sales_channel_id: channel.id,
        })),
      ),
    });
    createRemoteLinkStep(
      transform({ input, products }, ({ input, products }) =>
        input.products[0].shipping_profile_id
          ? [
              {
                [Modules.PRODUCT]: { product_id: products[0].id },
                [Modules.FULFILLMENT]: { shipping_profile_id: input.products[0].shipping_profile_id },
              },
            ]
          : [],
      ),
    );
    const variants = createProductVariantsWorkflow.runAsStep({
      input: transform({ input, products }, ({ input, products }) => ({
        product_variants: (input.products[0].variants || []).map((variant) => ({
          ...variant,
          product_id: products[0].id,
        })),
      })),
    });
    const result = transform({ products, variants }, ({ products, variants }) => [
      { ...products[0], variants },
    ]);
    emitEventStep({
      eventName: ProductWorkflowEvents.CREATED,
      data: transform({ products }, ({ products }) => products.map((product) => ({ id: product.id }))),
    });
    return new WorkflowResponse(result);
  },
);
