import {
  ContainerRegistrationKeys,
  MedusaError,
} from "@medusajs/framework/utils"
import {
  StepResponse,
  WorkflowResponse,
  createStep,
  createWorkflow,
} from "@medusajs/workflows-sdk"
import {
  addToCartWorkflow,
  createCartWorkflow,
  deleteLineItemsWorkflow,
  updateLineItemInCartWorkflow,
} from "@medusajs/medusa/core-flows"
import {
  buildChefEventPaymentSummary,
  getMinimumInitialTicketQuantity,
  getPendingAdditionalCharges,
  normalizeAdditionalCharges,
  requiresMinimumTicketsWithPendingCharges,
  type ChefEventPaymentSummary,
} from "../lib/chef-event-additional-charges"
import { getSystemChargeVariantId } from "../lib/system-charge-variant"
import "./hooks/validate-add-to-cart"

const CHARGE_LINE_KIND = "chef_event_additional_charge" as const
const TICKET_LINE_KIND = "chef_event_ticket" as const

type InitializeChefEventCartInput = {
  chef_event_id: string
  quantity: number
  cart_id?: string
}

type InitializeChefEventCartOutput = {
  cart: Record<string, unknown> | undefined
  paymentSummary: ChefEventPaymentSummary
}

type ChargeLineMetadata = {
  kind: typeof CHARGE_LINE_KIND
  chef_event_id: string
  chef_event_product_id: string
  chef_event_charge_id: string
  charge_name: string
  via_event_checkout: true
}

type TicketLineMetadata = {
  kind: typeof TICKET_LINE_KIND
  chef_event_id: string
  via_event_checkout: true
}

type CartLineItemSnapshot = {
  id?: string
  variant_id?: string
  quantity?: number | string
  metadata?: Record<string, unknown> | null
}

const initializeChefEventCartStep = createStep(
  "initialize-chef-event-cart-step",
  async (
    input: InitializeChefEventCartInput,
    { container },
  ): Promise<StepResponse<InitializeChefEventCartOutput>> => {
    const query = container.resolve(ContainerRegistrationKeys.QUERY)

    type ChefEventRow = {
      id: string
      status: string
      partySize: number | string
      productId: string | null
      additionalCharges: unknown
    }
    type ProductVariantRow = {
      id?: string
      sku?: string | null
      prices?: Array<{ amount?: number; currency_code?: string }> | null
    }
    type ProductRow = {
      id?: string
      variants?: ProductVariantRow[] | null
    }

    const { data: chefEvents } = (await query.graph({
      entity: "chef_event",
      fields: ["id", "status", "partySize", "productId", "additionalCharges"],
      filters: { id: input.chef_event_id },
    })) as { data?: ChefEventRow[] }
    const chefEvent = chefEvents?.[0]
    if (!chefEvent) {
      throw new MedusaError(MedusaError.Types.NOT_FOUND, "Chef event not found")
    }
    if (chefEvent.status !== "confirmed") {
      throw new MedusaError(
        MedusaError.Types.NOT_ALLOWED,
        "Only confirmed chef events can initialize checkout carts",
      )
    }
    if (!chefEvent.productId) {
      throw new MedusaError(
        MedusaError.Types.NOT_ALLOWED,
        "Chef event has no purchasable product",
      )
    }

    const { data: products } = (await query.graph({
      entity: "product",
      fields: [
        "id",
        "variants.id",
        "variants.sku",
        "variants.prices.amount",
        "variants.prices.currency_code",
      ],
      filters: { id: chefEvent.productId },
    })) as { data?: ProductRow[] }
    const product = products?.[0]
    const eventVariant =
      product?.variants?.find((variant) =>
        String(variant?.sku ?? "").startsWith("EVENT-"),
      ) ?? product?.variants?.[0]

    if (!eventVariant?.id) {
      throw new MedusaError(
        MedusaError.Types.NOT_FOUND,
        "Event ticket variant not found",
      )
    }

    const usdPrice = eventVariant.prices?.find(
      (p) => p?.currency_code?.toLowerCase?.() === "usd",
    )
    const pricePerTicketCents = Math.round(Number(usdPrice?.amount ?? 0) * 100)

    const additionalCharges = normalizeAdditionalCharges(
      chefEvent.additionalCharges,
    )
    const pendingCharges = getPendingAdditionalCharges(additionalCharges)
    const minimumInitialQuantity = getMinimumInitialTicketQuantity(
      Number(chefEvent.partySize) || 1,
    )

    if (
      requiresMinimumTicketsWithPendingCharges(additionalCharges) &&
      input.quantity < minimumInitialQuantity
    ) {
      throw new MedusaError(
        MedusaError.Types.NOT_ALLOWED,
        `A minimum of ${minimumInitialQuantity} tickets is required while additional charges are pending.`,
      )
    }

    let cartId = input.cart_id
    if (!cartId) {
      const { data: regions } = await query.graph({
        entity: "region",
        fields: ["id", "currency_code"],
        pagination: { take: 1 },
      })
      const region = regions?.[0]
      if (!region?.id || !region?.currency_code) {
        throw new MedusaError(
          MedusaError.Types.NOT_FOUND,
          "No region available to create a cart",
        )
      }

      const { result: createdCart } = await createCartWorkflow(container).run({
        input: {
          region_id: region.id,
          currency_code: region.currency_code,
        },
      })
      cartId = createdCart.id
    }

    const systemChargeVariantId = await getSystemChargeVariantId(container)
    if (!systemChargeVariantId) {
      throw new MedusaError(
        MedusaError.Types.NOT_FOUND,
        "System charge variant not found. Run ensure-system-charge-product script.",
      )
    }

    const { data: cartRows } = await query.graph({
      entity: "cart",
      fields: [
        "id",
        "items.id",
        "items.variant_id",
        "items.quantity",
        "items.metadata",
      ],
      filters: { id: cartId },
    })
    const cart = cartRows?.[0]
    const items = (cart?.items ?? []) as CartLineItemSnapshot[]

    const pendingChargeIds = new Set(pendingCharges.map((charge) => charge.id))
    const existingChargeItemsByChargeId = new Map<
      string,
      { id: string; quantity: number }
    >()
    const staleChargeLineItemIds: string[] = []
    let existingTicketLineItem:
      | { id: string; quantity: number }
      | undefined

    for (const item of items) {
      const metadata = (item.metadata ?? {}) as Record<string, unknown>
      const eventId =
        typeof metadata.chef_event_id === "string"
          ? metadata.chef_event_id
          : null
      if (eventId !== chefEvent.id || typeof item.id !== "string") {
        continue
      }

      if (metadata.kind === TICKET_LINE_KIND) {
        existingTicketLineItem = {
          id: item.id,
          quantity: Number(item.quantity) || 0,
        }
        continue
      }

      if (metadata.kind === CHARGE_LINE_KIND) {
        const chargeId =
          typeof metadata.chef_event_charge_id === "string"
            ? metadata.chef_event_charge_id
            : null
        if (!chargeId || !pendingChargeIds.has(chargeId)) {
          staleChargeLineItemIds.push(item.id)
          continue
        }
        existingChargeItemsByChargeId.set(chargeId, {
          id: item.id,
          quantity: Number(item.quantity) || 0,
        })
      }
    }

    if (staleChargeLineItemIds.length > 0) {
      await deleteLineItemsWorkflow(container).run({
        input: {
          cart_id: cartId,
          ids: staleChargeLineItemIds,
        },
      })
    }

    if (
      existingTicketLineItem &&
      existingTicketLineItem.quantity !== input.quantity
    ) {
      await updateLineItemInCartWorkflow(container).run({
        input: {
          cart_id: cartId,
          item_id: existingTicketLineItem.id,
          update: {
            quantity: input.quantity,
          },
        },
      })
    }

    const itemsToAdd: Array<{
      variant_id: string
      quantity: number
      unit_price?: number
      metadata: TicketLineMetadata | ChargeLineMetadata
    }> = []

    if (!existingTicketLineItem) {
      itemsToAdd.push({
        variant_id: String(eventVariant.id),
        quantity: input.quantity,
        metadata: {
          kind: TICKET_LINE_KIND,
          chef_event_id: chefEvent.id,
          via_event_checkout: true,
        },
      })
    }

    for (const charge of pendingCharges) {
      const chargeUnitPrice = charge.amount / 100
      const chargeMetadata: ChargeLineMetadata = {
        kind: CHARGE_LINE_KIND,
        chef_event_id: chefEvent.id,
        chef_event_product_id: chefEvent.productId,
        chef_event_charge_id: charge.id,
        charge_name: charge.name,
        via_event_checkout: true,
      }

      const existingChargeLine = existingChargeItemsByChargeId.get(charge.id)
      if (existingChargeLine) {
        await updateLineItemInCartWorkflow(container).run({
          input: {
            cart_id: cartId,
            item_id: existingChargeLine.id,
            update: {
              quantity: 1,
              unit_price: chargeUnitPrice,
              metadata: chargeMetadata,
            },
          },
        })
        continue
      }

      itemsToAdd.push({
        variant_id: systemChargeVariantId,
        quantity: 1,
        unit_price: chargeUnitPrice,
        metadata: chargeMetadata,
      })
    }

    if (itemsToAdd.length > 0) {
      await addToCartWorkflow(container).run({
        input: {
          cart_id: cartId,
          items: itemsToAdd,
        },
      })
    }

    const { data: updatedRows } = await query.graph({
      entity: "cart",
      fields: ["*"],
      filters: { id: cartId },
    })
    const updatedCart = updatedRows?.[0]

    const paymentSummary = buildChefEventPaymentSummary({
      partySize: Number(chefEvent.partySize) || 1,
      pricePerTicket: pricePerTicketCents,
      charges: additionalCharges,
    })

    return new StepResponse({
      cart: updatedCart,
      paymentSummary,
    })
  },
)

export const initializeChefEventCartWorkflow = createWorkflow(
  "initialize-chef-event-cart-workflow",
  function (input: InitializeChefEventCartInput) {
    const result = initializeChefEventCartStep(input)
    return new WorkflowResponse(result)
  },
)
