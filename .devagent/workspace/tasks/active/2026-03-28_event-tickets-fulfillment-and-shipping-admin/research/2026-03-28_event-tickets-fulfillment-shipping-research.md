# Research — Event ticket fulfillment semantics & admin “Requires shipping”

- **Classification:** Implementation design (Medusa v2 + custom chef-event workflow)
- **Last Updated:** 2026-03-28 (run `date +%Y-%m-%d` before edits)
- **Storage path:** `.devagent/workspace/tasks/active/2026-03-28_event-tickets-fulfillment-and-shipping-admin/research/2026-03-28_event-tickets-fulfillment-shipping-research.md`
- **Related task hub:** `.devagent/workspace/tasks/active/2026-03-28_event-tickets-fulfillment-and-shipping-admin/AGENTS.md`

## Inferred problem statement

Event ticket orders show **Captured** payment but remain **Not fulfilled** in admin, and line items show **Requires shipping** despite $0 shipping and digital ticket intent. Desired behavior: treat tickets as fulfilled when **payment is captured** *or* **event date has passed**, and stop showing **Requires shipping** for these SKUs.

## Assumptions

- `[INFERRED]` Admin UI is Medusa Dashboard (`@medusajs/dashboard`), unmodified for order fulfillment section.
- `[INFERRED]` “Fulfilled” means Medusa order/line fulfillment state (fulfillment records / `fulfilled_quantity`), not only a cosmetic label.
- `[INFERRED]` Event tickets are created through `accept-chef-event` workflow with `EVENT-*` SKUs and `ChefEvent.productId` linking to the sellable product.

## Research plan (what was validated)

1. Where Dashboard gets **Requires shipping** for order line items.
2. How `requires_shipping` is set for managed inventory variants in Medusa core.
3. Whether `accept-chef-event` correctly sets `requires_shipping: false` on the inventory item **actually linked** to the variant.
4. Where event date and product linkage live for automation (capture vs. post-event).
5. Gaps between storefront digital-cart helpers and admin data.

## Sources

| Reference | Type | Freshness | Notes |
| --- | --- | --- | --- |
| `apps/medusa/src/workflows/accept-chef-event.ts` | Repo | 2026-03-28 | Event product + inventory creation |
| `apps/medusa/node_modules/@medusajs/core-flows/dist/product/workflows/create-product-variants.js` | Vendor (installed) | Medusa pkg in repo | Default inventory `requires_shipping: true` |
| `apps/medusa/node_modules/@medusajs/dashboard/src/routes/orders/order-detail/components/order-fulfillment-section/order-fulfillment-section.tsx` | Vendor (installed) | Medusa pkg in repo | UI gates on `item.requires_shipping` |
| `apps/storefront/libs/util/cart/cart-helpers.ts` | Repo | 2026-03-28 | Storefront treats `requires_shipping === false` or `EVENT-` SKU as digital |
| `apps/medusa/src/modules/chef-event/models/chef-event.ts` | Repo | 2026-03-28 | `productId`, `requestedDate` for event scheduling |

## Findings & tradeoffs

### 1. Admin “Requires shipping” is driven by `order.items[].requires_shipping`

Dashboard splits unfulfilled lines into two buckets:

- `requires_shipping === true` → shows red **Requires shipping** badge (`orders.fulfillment.requiresShipping`) and routes fulfillment with `?requires_shipping=true`.
- `requires_shipping === false` → unfulfilled block **without** that badge; still **Awaiting fulfillment** until quantities are fulfilled.

Evidence: `order-fulfillment-section.tsx` filters `order.items` by `i.requires_shipping` before rendering `UnfulfilledItemDisplay`.

### 2. Medusa defaults new managed inventory to `requires_shipping: true`

In `createProductVariantsWorkflow`, when `manage_inventory` is true and the variant does **not** supply `inventory_items`, core builds a default inventory payload with **`requires_shipping: true`** (hardcoded in `buildVariantItemCreateMap`), then creates inventory items and **links the variant to that item**.

### 3. Root cause in this repo: event workflow never corrects the auto-created inventory item

`accept-chef-event` runs `createProductsWorkflow` with `manage_inventory: true` and **no** `inventory_items` on the variant. That creates an inventory row linked to the variant with **requires_shipping: true**.

Afterward, `createEventProductStep` calls `listInventoryItems({ sku: variant.sku })`. The auto-created item **matches the SKU**, so the branch **`existingInventoryItems.length > 0`** reuses it and **skips** `createInventoryItems({ requires_shipping: false, ... })`. Stock levels at “Digital Location” are added, but **`requires_shipping` stays true** on the linked inventory item.

So: the comment in `accept-chef-event.ts` (digital behavior driven by `requires_shipping: false`) is **intended**, but the **reuse-by-SKU path** prevents the flag from ever being set to false for normal creates.

**Contrast:** Storefront `hasOnlyDigitalItems` treats `EVENT-` SKUs as digital even when `requires_shipping` is wrong, which **masks** the data bug in checkout but **not** in admin.

### 4. Fulfillment vs. payment

Payment **Captured** does **not** automatically create fulfillments in this codebase (no subscribers found for `payment.captured` / auto-fulfillment under `apps/medusa/src/subscribers/`). Medusa will still show **Not fulfilled** until fulfillment steps run (manual admin action or custom automation).

### 5. Event date for “event has passed”

- SKU embeds date: `EVENT-${chefEvent.id}-${YYYY-MM-DD}-${eventType}` (UTC date from `requestedDate.toISOString().split('T')[0]`).
- Canonical structured source: **`ChefEvent.requestedDate`** (and `productId` → join from order line `product_id`). Prefer module data over parsing SKU for timezone and clarity.

Tradeoff: SKU parsing is fragile; `ChefEvent` lookup is robust but requires a service/query from order → product → chef event.

## Recommendation

1. **Fix `requires_shipping` (data correction)**  
   After product + inventory exist, either:
   - **Update** the linked inventory item(s) to `requires_shipping: false` (e.g. `updateInventoryItems` / equivalent workflow), or  
   - **Refactor** creation order: pre-create inventory with `requires_shipping: false` and pass `inventory_items: [{ inventory_item_id }]` on the variant so core does not emit the default `true` item, or  
   - **One-time migration** for existing `EVENT-*` inventory rows and variants already in DB.

   Smallest change: in `createEventProductStep`, when reusing an existing item by SKU, **patch** `requires_shipping` to `false` if it is `true`.

2. **Fulfillment automation (behavior)**  
   - On **payment captured** (or order completed): subscriber/workflow that creates fulfillments for ticket lines (likely `requires_shipping: false` “delivery” path) so admin shows fulfilled.  
   - For **post-event**: scheduled job or subscriber that loads `ChefEvent` by `product_id`, compares `requestedDate` to “now” (define timezone policy), then creates fulfillments for qualifying unpaid edge cases if still required by policy.

3. **Clarify product intent**  
   Confirm with stakeholders: should post-event fulfillment apply when payment is **not** captured, or only as a backstop for partial edge cases?

## Repo next steps (checklist)

- [ ] Patch `accept-chef-event` inventory path (update-on-reuse + optional backfill script for existing tickets).
- [ ] Verify admin order detail: unfulfilled section should **not** show **Requires shipping** for new ticket orders.
- [ ] Design subscriber(s) or workflow hooks for auto-fulfillment on capture + post-event job.
- [ ] Add integration test or manual test matrix: new accept path, old bad data migration, order with captured payment.
- [ ] Run `devagent clarify-task` on timezone and “fulfilled without capture” rules.

## Risks & open questions

| Item | Type | Mitigation / next step |
| --- | --- | --- |
| Existing orders keep wrong flag until migration | Risk | Script or admin bulk fix for inventory items linked to `EVENT-*` variants |
| `requires_shipping` vs variant-level flags | Question | Confirm Medusa version maps line item from inventory only; spot-check API payload for `AdminOrderLineItem` |
| Mixed carts (ticket + physical) | Risk | Auto-fulfill only lines that are digital / `EVENT-*` / `requires_shipping: false` |
| Event “day” timezone | Question | Align `requestedDate` storage (UTC vs local) with business rule for “event has passed” |

## Recommended follow-ups

- `devagent create-plan` — Sequence: inventory fix → migration → fulfillment subscribers → optional cron.
- `devagent clarify-task` — Lock payment-vs-event OR logic and timezone.
