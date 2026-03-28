# Event Tickets Fulfillment and Admin Shipping Status Plan

- **Owner:** PabloJVelez
- **Last Updated:** 2026-03-28
- **Status:** Draft
- **Related Task Hub:** `.devagent/workspace/tasks/active/2026-03-28_event-tickets-fulfillment-and-shipping-admin/`
- **Stakeholders:** PabloJVelez (decision maker)
- **Inputs:** [Research](../research/2026-03-28_event-tickets-fulfillment-shipping-research.md), [Clarification](../clarification/2026-03-28_initial-clarification.md)

---

## PART 1: PRODUCT CONTEXT

### Summary

Event ticket orders in Medusa admin show **Requires shipping** and stay **Not fulfilled** even when payment is captured, because linked inventory items keep Medusa’s default **`requires_shipping: true`**, and nothing auto-creates fulfillments. This plan fixes inventory data for ticket variants, **auto-fulfills ticket lines when payment is captured**, and adds a **scheduled job** that **auto-captures** authorized payments starting **~24 hours after the event** so the same capture → fulfill path runs. **Mixed carts** only auto-fulfill **ticket** lines; physical lines follow normal shipping flows.

### Context & Problem

- **Admin UX:** Dashboard uses `order.items[].requires_shipping` for the **Requires shipping** badge (`@medusajs/dashboard` order fulfillment section). See research packet.
- **Root cause:** `createProductVariantsWorkflow` creates default inventory with `requires_shipping: true`; `accept-chef-event` finds that row by SKU and never sets `requires_shipping: false`.
- **Fulfillment gap:** `payment.captured` is not handled today; Medusa remains “awaiting fulfillment” until someone creates fulfillments manually.
- **Post-event capture:** Stakeholder wants delayed capture if authorization is still open after the event, implemented as automation (not calendar-only fulfillment).

### Objectives & Success Metrics

- **O1:** New and backfilled ticket inventory has `requires_shipping: false` → admin no longer shows **Requires shipping** for those lines.
- **O2:** On successful capture, ticket line items receive fulfillments without manual admin action; mixed orders only touch `EVENT-*` (or equivalent) lines.
- **O3:** Job runs on a schedule, finds eligible chef-event orders past **event + ~24h**, runs `capturePaymentWorkflow` where appropriate; failures are logged (and optionally alerted) without corrupting state.

### Users & Insights

- **Primary:** Admin/ops (chef template) reviewing orders in Medusa Dashboard.
- **Insight:** Storefront already treats `EVENT-*` SKUs as digital in places (`apps/storefront/libs/util/cart/cart-helpers.ts`); backend data must match so admin and APIs align.

### Solution Principles

- Reuse existing conventions: **`EVENT-` SKU prefix** (already used in `apps/medusa/src/modules/stripe-connect/utils/platform-fee.ts`).
- Prefer **Medusa workflows** (`capturePaymentWorkflow`, `createOrderFulfillmentWorkflow`) over ad hoc module calls where possible ([Medusa scheduled jobs guidance](https://docs.medusajs.com/learn/fundamentals/scheduled-jobs)).
- **Idempotent** subscribers and jobs (skip if already captured / already fulfilled).

### Scope Definition

- **In scope:** `accept-chef-event` inventory fix; optional DB backfill for existing ticket inventory; subscriber on **`payment.captured`** (payload `{ id }` payment id — [events reference](https://docs.medusajs.com/resources/references/events#payment-events)); scheduled job + workflow for delayed capture; logging for capture failures.
- **Out of scope:** Forking Dashboard; changing Stripe Connect fee logic; storefront checkout changes (unless tests require fixture updates).
- **Future:** Explicit chef-event timezone field if “event date” must be non-UTC.

### Functional Narrative

#### Flow A — Customer pays (capture)

- **Trigger:** Payment becomes fully captured (`payment.captured` emitted from `capturePaymentWorkflow` / `processPaymentWorkflow` / etc.).
- **System:** Resolve **order** from payment → payment collection → order; load items; select lines where **`variant_sku` starts with `EVENT-`** (and `detail.fulfilled_quantity < quantity`); if none, exit.
- **System:** Run `createOrderFulfillmentWorkflow` with **`shipping_option_id`** matching the order’s **digital** shipping option for those items (see technical notes); if order has only digital shipping, use that method’s option id.
- **Outcome:** Ticket lines show fulfilled; physical lines on mixed orders unchanged.

#### Flow B — Post-event auto-capture

- **Trigger:** Scheduled job runs on a short cron (e.g. hourly) while the Medusa app is running ([scheduled jobs require running server](https://docs.medusajs.com/learn/fundamentals/scheduled-jobs)).
- **System:** List **confirmed** `ChefEvent` rows where **`requestedDate + 24 hours <= now`** per locked time rule (below); each has `productId`.
- **System:** Find orders containing that product with **authorized but not fully captured** payments (`stripe-connect`); for each eligible payment, run **`capturePaymentWorkflow`** with `payment_id` ([docs](https://docs.medusajs.com/resources/references/medusa-workflows/capturePaymentWorkflow)).
- **Outcome:** Successful capture emits **`payment.captured`** → Flow A fulfills ticket lines.

#### Flow C — New ticket products

- **Trigger:** Chef accepts event → `accept-chef-event` runs.
- **System:** After product + inventory exist, ensure linked inventory item has **`requires_shipping: false`** (update if reused by SKU).

### Technical Notes & Dependencies

- **Event payload:** `payment.captured` → `{ id }` (payment id). Implementer resolves order via **Query** / graph (payment → collection → order) — confirm fields in current Medusa version during implementation.
- **Fulfillment:** `createOrderFulfillmentWorkflow` requires valid **`shipping_option_id`** and items grouped by shipping rules (see `apps/medusa/node_modules/@medusajs/core-flows/dist/order/workflows/create-fulfillment.js`). Digital ticket orders should already have a **Digital Delivery** method from checkout; for **mixed** carts, pass the **digital** option id for ticket lines only (admin create-fulfillment uses `?requires_shipping=false` — mirror that split).
- **Stripe:** `StripeConnectProviderService.capturePayment` already handles `requires_capture` → `paymentIntents.capture` (`apps/medusa/src/modules/stripe-connect/service.ts`). Handle non-capturable states with warn + skip in job.
- **Time rule (plan default):** Eligible for post-event job when `requestedDate.getTime() + 24 * 60 * 60 * 1000 <= Date.now()` (wall-clock from stored **timestamptz**). If `requestedDate` is always midnight UTC for the event day, this matches “24h after that instant”; adjust if business later defines “end of event day” in a locale.

---

## PART 2: IMPLEMENTATION PLAN

### Scope & Assumptions

- **Scope:** Backend Medusa only (`apps/medusa`), plus optional small shared util if duplicated `EVENT-` checks are consolidated.
- **Assumptions:** Medusa **server/worker** process runs continuously enough for scheduled jobs; Stripe authorizations remain capturable at T+24h; orders for chef events link to ticket `product_id` discoverable from line items.

### Implementation Tasks

#### Task 1: Fix `requires_shipping` for event ticket inventory (forward + backfill)

- **Objective:** Ticket variants’ linked inventory items must have `requires_shipping: false` so admin and APIs match digital intent.
- **Impacted modules/files:**
  - `apps/medusa/src/workflows/accept-chef-event.ts` — after resolving `inventoryItem` (create or reuse by SKU), call **`updateInventoryItems`** (or equivalent workflow) when `requires_shipping !== false`.
  - New script under `apps/medusa/src/scripts/` (e.g. `fix-event-ticket-inventory-shipping.ts`) **optional but recommended:** list inventory items whose SKU matches `EVENT-%` pattern and set `requires_shipping: false`.
- **References:** Research packet; [Medusa inventory](https://docs.medusajs.com/resources/commerce-modules/inventory).
- **Dependencies:** None.
- **Acceptance criteria:**
  - Newly accepted events produce inventory rows with `requires_shipping: false`.
  - Re-running accept path does not regress flags.
  - Script (if added) is idempotent and documented in plan handoff / README snippet in script header.
- **Testing criteria:** Manual: create or pick `EVENT-*` inventory in admin **or** run script then place test order — line items show **no** Requires shipping bucket for digital lines.
- **Validation plan:** Run script against dev DB copy; verify one historical SKU from user screenshots.

#### Task 2: Subscriber — `payment.captured` → fulfill ticket lines only

- **Objective:** On capture, automatically fulfill **eligible ticket** order lines using `createOrderFulfillmentWorkflow`.
- **Impacted modules/files:**
  - New `apps/medusa/src/subscribers/event-ticket-payment-captured.ts` (name flexible).
  - Possibly `apps/medusa/src/workflows/fulfill-event-ticket-lines.ts` wrapping query + `createOrderFulfillmentWorkflow` for clarity and retries.
  - Reuse or re-export `isEventSku` from `apps/medusa/src/modules/stripe-connect/utils/platform-fee.ts` (or move to `apps/medusa/src/lib/event-ticket.ts` if you want to avoid coupling).
- **References:** [payment.captured](https://docs.medusajs.com/resources/references/events#paymentcaptured); [createOrderFulfillmentWorkflow](https://docs.medusajs.com/resources/references/medusa-workflows/createOrderFulfillmentWorkflow); existing subscriber pattern `apps/medusa/src/subscribers/chef-event-requested.ts`.
- **Dependencies:** Task 1 (correct `requires_shipping` avoids wrong fulfillment bucket).
- **Acceptance criteria:**
  - Subscriber registered with `event: "payment.captured"` (or `PaymentEvents.CAPTURED` from `@medusajs/utils`).
  - Resolves **order** from `data.id` payment id; loads items with `variant_sku`, `requires_shipping`, `detail.fulfilled_quantity`.
  - Selects only lines with **`EVENT-` SKU** and unfulfilled quantity > 0.
  - Invokes `createOrderFulfillmentWorkflow` with correct **`shipping_option_id`** for digital fulfillment (resolve **Digital Delivery** / digital profile option tied to order or stock location — mirror init seed in `apps/medusa/src/scripts/init.ts`).
  - **Idempotent:** no error if nothing to fulfill; safe on duplicate events.
- **Testing criteria:** Integration or manual: complete checkout for event ticket → capture → admin shows ticket line fulfilled; mixed cart leaves physical line unfulfilled.
- **Validation plan:** Log structured messages (payment id, order id, line ids) at info level for first deploy.

#### Task 3: Scheduled job + workflow — post-event auto-capture

- **Objective:** Approximately **24 hours after `ChefEvent.requestedDate`**, attempt **capture** for orders tied to that event’s `productId` that still have capturable payments.
- **Impacted modules/files:**
  - New `apps/medusa/src/jobs/post-event-capture-ticket-payments.ts` with `config.schedule` (e.g. `0 * * * *` hourly — aligns with “~24h” without per-event cron).
  - New workflow `apps/medusa/src/workflows/post-event-capture-payments.ts` (recommended): steps to list eligible chef events, resolve candidate orders/payments, run `capturePaymentWorkflow` per payment.
- **References:** [Scheduled jobs](https://docs.medusajs.com/learn/fundamentals/scheduled-jobs); [capturePaymentWorkflow](https://docs.medusajs.com/resources/references/medusa-workflows/capturePaymentWorkflow).
- **Dependencies:** Task 2 (capture triggers fulfillment).
- **Acceptance criteria:**
  - Job selects chef events with `status: 'confirmed'`, non-null `productId`, and `requestedDate + 24h <= now` (per plan time rule).
  - Finds orders containing line items for that **product** (via order module or Query).
  - For each uncaptured authorized payment on `stripe-connect`, runs `capturePaymentWorkflow({ payment_id })`; skips if already captured or provider state not `requires_capture`.
  - Failures logged; no unbounded retry storm (consider simple “last attempted” metadata on payment or chef_event in a follow-up if needed — **optional** v1: log only).
- **Testing criteria:** Manual or integration with mocked clock: chef event with `requestedDate` in the past + authorized payment → job run → capture + subscriber fulfill.
- **Validation plan:** Staging: set event date in past, wait or trigger job schedule in dev.

#### Task 4: Automated tests and regression guards

- **Objective:** Prevent regressions on inventory flag and line selection logic.
- **Impacted modules/files:**
  - Unit tests for pure helpers (e.g. `isEventSku`, “select fulfillable ticket lines”).
  - If repo has Medusa integration test harness, add one scenario for capture → fulfillment; otherwise document **manual test matrix** in task hub after implementation.
- **References:** `.cursor/rules/testing-patterns-unit.mdc`, `testing-patterns-integration.mdc`.
- **Dependencies:** Tasks 1–3.
- **Acceptance criteria:**
  - Tests pass in CI for new helpers.
  - Manual matrix documented: ticket-only captured; mixed cart; post-event job path; capture failure (declined) leaves order fulfillable manually.
- **Testing criteria:** `pnpm` / `yarn` test from repo root per project convention.
- **Validation plan:** CI green.

### Implementation Guidance

- **Subscribers:** Follow `apps/medusa/src/subscribers/chef-event-requested.ts` — `SubscriberConfig` with `event` string; resolve `logger` via `ContainerRegistrationKeys.LOGGER` or `container.resolve("logger")`.
- **Medusa patterns:** Prefer workflows for multi-step work (jobs call workflows — [Medusa v2 scheduled job guidance](https://docs.medusajs.com/learn/introduction/from-v1-to-v2#scheduled-job-changes)).
- **TypeScript:** Match existing strict typing; avoid `any` in new code; use `MedusaError` for invalid states where appropriate (`.cursor/rules/typescript-patterns.mdc`).
- **DRY:** Centralize `EVENT-` SKU detection next to `platform-fee.ts` or a small `lib/event-ticket.ts`.

### Release & Delivery Strategy

- Deploy Tasks **1 → 2 → 3** in order; run backfill script before relying on admin accuracy for old data.
- Ensure **worker** mode / process runs scheduled jobs if production splits server and worker (`medusa-config.ts` `workerMode`).

---

## Risks & Open Questions

| Item | Type | Owner | Mitigation / next step |
| --- | --- | --- | --- |
| `payment.captured` payload only has payment `id` | Risk | Eng | Implement Query path order resolution; add integration test |
| Mixed cart: multiple shipping methods / option id resolution | Risk | Eng | Inspect order `shipping_methods` for digital profile; document chosen resolution in code comments |
| Scheduled job not running if server down | Risk | Ops | Document that Medusa must be up; alternative OS cron + CLI script later |
| Stripe auth expires before T+24h | Risk | Product | Log + notify; clarify policy for re-auth |
| `requestedDate` timezone semantics | Question | Pablo | Plan default: +24h from stored instant; revisit if events are “local calendar date” |

---

## Plan Change Log

| Date | Change |
| --- | --- |
| 2026-03-28 | Initial plan from research + clarification + Medusa docs (payment events, scheduled jobs, workflows) |
