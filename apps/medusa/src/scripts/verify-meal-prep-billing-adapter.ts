import assert from "node:assert/strict";
import type {
  ExecArgs,
  IOrderModuleService,
  IPaymentModuleService,
} from "@medusajs/framework/types";
import { Modules } from "@medusajs/framework/utils";
import { testCommerceInputs } from "../modules/meal-prep/medusa-test-billing-adapter";

/** Invoked only by migrations.cjs against its newly created disposable database. */
export default async function verify({ container }: ExecArgs) {
  if (
    process.env.NODE_ENV !== "test" ||
    !new URL(process.env.DATABASE_URL!).pathname.startsWith("/mp_fresh_")
  )
    throw new Error("Explicit fresh test database required");
  const orders = container.resolve<IOrderModuleService>(Modules.ORDER);
  const payments = container.resolve<IPaymentModuleService>(Modules.PAYMENT);
  for (const amount of [1, 1000, 1050]) {
    const input = testCommerceInputs({
      billId: `bill_${amount}`,
      quoteId: `quote_${amount}`,
      subjectId: `occurrence_${amount}`,
      currency: "USD",
      totalMinor: amount,
    });
    const order = await orders.createOrders(input.order);
    const collection = await payments.createPaymentCollections(
      input.collection,
    );
    const storedOrder = await orders.retrieveOrder(order.id, {
      select: ["id", "currency_code", "metadata", "total"],
      relations: ["items"],
    });
    const storedCollection = await payments.retrievePaymentCollection(
      collection.id,
    );
    assert.equal(Math.round(Number(storedOrder.total) * 100), amount);
    assert.equal(Math.round(Number(storedCollection.amount) * 100), amount);
    assert.equal(storedOrder.items![0].variant_id, null);
    assert.equal(storedOrder.metadata!.meal_prep_quote_id, `quote_${amount}`);
    assert.equal(
      storedCollection.metadata!.meal_prep_quote_id,
      `quote_${amount}`,
    );
    assert.equal(storedCollection.status, "not_paid");
    console.log(
      `Installed Medusa order + unpaid collection round-trip: ${amount} minor units`,
    );
  }
}
