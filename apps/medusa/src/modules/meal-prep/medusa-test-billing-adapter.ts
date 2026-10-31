import type {
  CreateOrderDTO,
  CreatePaymentCollectionDTO,
  IOrderModuleService,
  IPaymentModuleService,
} from "@medusajs/framework/types";
import type MealPrepModuleService from "./service";
import { BillingError, requireBillingTestMode } from "./billing-contracts";

export type CommerceSnapshot = {
  billId: string;
  quoteId: string;
  subjectId: string;
  currency: "USD";
  totalMinor: number;
};
/** Explicit USD minor -> Medusa major conversion. Never guess units from integrality. */
export function usdMajor(minor: number): string {
  if (!Number.isSafeInteger(minor) || minor < 1 || minor > 99999999)
    throw new BillingError("INVALID_AMOUNT");
  return `${Math.floor(minor / 100)}.${String(minor % 100).padStart(2, "0")}`;
}
const metadata = (q: CommerceSnapshot) => ({
  meal_prep_bill_id: q.billId,
  meal_prep_quote_id: q.quoteId,
  meal_prep_occurrence_id: q.subjectId,
  meal_prep_test_only: true,
});
export function testCommerceInputs(q: CommerceSnapshot): {
  order: CreateOrderDTO;
  collection: CreatePaymentCollectionDTO;
} {
  requireBillingTestMode();
  if (q.currency !== "USD") throw new BillingError("UNSUPPORTED_CURRENCY");
  return {
    order: {
      currency_code: "usd",
      no_notification: true,
      metadata: metadata(q),
      items: [
        {
          title: "Approved meal prep occurrence (test)",
          quantity: 1,
          unit_price: usdMajor(q.totalMinor),
          requires_shipping: false,
          metadata: metadata(q),
        },
      ],
    },
    collection: {
      currency_code: "usd",
      amount: usdMajor(q.totalMinor),
      metadata: metadata(q),
    },
  };
}
/** Uses installed 2.7 module DTOs; durable claims are committed before module calls.
 * A crash without a returned ID blocks re-creation. Recovery requires an operator-supplied
 * existing ID and exact provider-independent metadata/amount verification.
 * These test records do not drive inventory, fulfillment or legacy event payments. */
export class MedusaTestBillingAdapter {
  constructor(
    private service: MealPrepModuleService,
    private orders: Pick<IOrderModuleService, "createOrders" | "retrieveOrder">,
    private payments: Pick<
      IPaymentModuleService,
      "createPaymentCollections" | "retrievePaymentCollection"
    >,
  ) {}
  async materialize(billId: string) {
    requireBillingTestMode();
    const result: Record<string, string> = {};
    for (const kind of ["order", "collection"] as const) {
      const claim = await this.service.claimTestCommerceResource(billId, kind);
      if (claim.resourceId) {
        result[kind] = claim.resourceId;
        continue;
      }
      if (!claim.claimed)
        throw new BillingError("COMMERCE_RECONCILIATION_REQUIRED");
      const input = testCommerceInputs(claim.snapshot);
      const resource =
        kind === "order"
          ? await this.orders.createOrders(input.order)
          : await this.payments.createPaymentCollections(input.collection);
      await this.recover(billId, kind, resource.id);
      result[kind] = resource.id;
    }
    return result;
  }
  async recover(
    billId: string,
    kind: "order" | "collection",
    resourceId: string,
  ) {
    requireBillingTestMode();
    const claim = await this.service.claimTestCommerceResource(billId, kind);
    if (claim.claimed)
      throw new BillingError("COMMERCE_RECONCILIATION_REQUIRED");
    const q = claim.snapshot;
    const resource =
      kind === "order"
        ? await this.orders.retrieveOrder(resourceId, {
            select: ["id", "currency_code", "metadata", "total"],
            relations: ["items"],
          })
        : await this.payments.retrievePaymentCollection(resourceId);
    for (const [key, value] of Object.entries(metadata(q)))
      if (resource.metadata?.[key] !== value)
        throw new BillingError("COMMERCE_MISMATCH");
    const amount =
      kind === "order"
        ? (
            resource as Awaited<
              ReturnType<IOrderModuleService["retrieveOrder"]>
            >
          ).total
        : (
            resource as Awaited<
              ReturnType<IPaymentModuleService["retrievePaymentCollection"]>
            >
          ).amount;
    if (
      resource.currency_code !== "usd" ||
      Number(amount) !== Number(usdMajor(q.totalMinor))
    )
      throw new BillingError("COMMERCE_MISMATCH");
    await this.service.claimTestCommerceResource(billId, kind, resourceId);
  }
}
