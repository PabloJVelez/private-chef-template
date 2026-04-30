# Chef Event Additional Charges Plan

- Owner: PabloJVelez
- Last Updated: 2026-04-29
- Status: Draft (post-review)
- Related Task Hub: `.devagent/workspace/tasks/active/2026-04-29_chef-event-additional-charges/`
- Stakeholders: PabloJVelez (Requestor, Decision Maker)
- Notes: Refined on 2026-04-29 after a Medusa v2 pattern review. Tasks renumbered; system charge product/variant promoted to a first-class task; workflow/hook/subscriber patterns made explicit; money representation pinned.

---

## PART 1: PRODUCT CONTEXT

### Summary
This task adds chef-managed, event-scoped additional charges that hosts pay once through the existing accepted-event purchase flow. The solution stays inside Medusa v2 cart/checkout/order primitives by extending `ChefEvent` with per-charge state, introducing a dedicated `initialize-chef-event-cart` workflow built on Medusa core-flows, and using a reusable system charge variant with line-item metadata to identify charge lines. Payment status for individual charge rows is reconciled via an `order.placed` subscriber, keeping all money in standard Medusa cart/order objects.

### Context & Problem
Current event purchases submit from storefront `EventProductDetails` into the generic `/api/cart/line-items/create` route, which resolves and adds a single variant line only. That path does not support: (a) atomically synchronizing event ticket + one-time charge rows, (b) enforcing strict event-cart rules, or (c) marking charge rows paid based on order outcomes. At the same time, the repo has event-ticket-specific fulfillment automation (`subscribers/event-ticket-payment-captured.ts`, `workflows/fulfill-event-ticket-lines.ts`) and digital-only checkout customizations (`libs/util/cart/cart-helpers.ts`) that must not regress.

References:
- Clarification packet: `.devagent/workspace/tasks/active/2026-04-29_chef-event-additional-charges/clarification/2026-04-29_initial-clarification.md`
- Research packet: `.devagent/workspace/tasks/active/2026-04-29_chef-event-additional-charges/research/2026-04-29_chef-event-additional-charges-research.md`

### Objectives & Success Metrics
- Add per-row additional charge modeling on `ChefEvent` with lifecycle `pending|paid|void`.
- Enable admin editing for pending rows while keeping paid rows immutable.
- Ensure host first-payment flow includes all pending charges and bills each charge row once.
- Preserve digital-only checkout behavior (no shipping-step regressions for event carts).
- Preserve event-ticket automation behavior (no false ticket fulfillment from charge lines).

Success is binary and behavior-based:
- Required acceptance criteria from clarification are all met.
- Existing event-ticket and checkout behavior remains stable for non-charge scenarios.

### Users & Insights
- Primary user: chef/admin managing `ChefEvent` records in Medusa admin.
- Secondary user: host completing accepted-event checkout in storefront.
- Key insight: one-time per-row charge behavior must be server-authoritative — frontend-only add-to-cart changes cannot enforce idempotent paid transitions or strict cart constraints.

### Solution Principles
- **Medusa-native first.** All money flows through Medusa cart/order. No draft orders, no external invoicing layer.
- **Source of truth on `ChefEvent`.** Cart contents are derived state; the chef event JSON column is canonical.
- **Core-flows over bespoke calls.** New workflows compose `addToCartWorkflow`, `createCartWorkflow`, etc. rather than calling the cart module directly.
- **Module service owns row mutations.** Custom methods on `ChefEventModuleService` centralize JSON-row validation and state rules.
- **Hooks for guardrails.** `addToCartWorkflow.hooks.validate(...)` enforces strict event-cart rules; subscribers handle late-bound side effects on `order.placed`.
- **Distinct identity for charge lines.** A reusable system charge variant + canonical line-item metadata (`kind: chef_event_additional_charge`) keeps charge lines disjoint from event-ticket SKU automation.
- **Strict v1 behavior.** Exclusive event carts, non-removable charge lines, paid-row immutability, `void` soft-delete, manual refund reconciliation.

### Architectural Decisions
- **Money representation:** charge `amount` is stored as **integer cents** to match Medusa core conventions for `unit_price` and `payment.amount`. UI/email rendering converts to dollars at display time only.
- **Identity convention:** charge lines are identified by `metadata.kind === "chef_event_additional_charge"` (primary) plus `metadata.chef_event_id` and `metadata.chef_event_charge_id`. SKU is intentionally distinct from `EVENT-*` to avoid ticket-automation overlap.
- **Cart composition:** `initializeChefEventCartWorkflow` is the only sanctioned path to add charge lines; the `addToCartWorkflow` validate hook rejects manual injections.
- **Paid transition trigger:** `OrderEvents.PLACED` subscriber inspects order line metadata and updates matching pending rows on the linked chef event. Idempotent.
- **Refund/cancel:** intentionally manual in v1 (no automated reverse transition).

### Scope Definition
- **In Scope:**
  - `ChefEvent.additionalCharges` data model + migration + DTO/schema updates.
  - Custom service methods on `ChefEventModuleService` for charge row lifecycle.
  - Admin API/workflow/UI updates for additional charge management.
  - System charge product/variant setup (idempotent script + documentation).
  - `initializeChefEventCartWorkflow` + corresponding store route.
  - `addToCartWorkflow.hooks.validate(...)` for strict event-cart rules.
  - `OrderEvents.PLACED` subscriber to mark charge rows paid.
  - Storefront event purchase flow change to use the new initialize-cart path.
  - Cart/checkout/order rendering updates for charge-line labels + non-removable behavior.
- **Out of Scope / Future:**
  - Automatic reopen/reversal logic for refund/cancel.
  - Mixed cart support (event + non-event products).
  - Host ability to override/remove one-time charge lines.

### Functional Narrative

#### Flow 1 — Admin manages additional charges
- Trigger: chef/admin opens event detail and edits additional charges.
- Experience narrative:
  - Pending rows can be added/edited/voided.
  - Paid rows are visible but read-only (`name`/`amount` locked).
  - Deleting a pending row maps to `status = void`.
- Acceptance criteria:
  - Validation rejects malformed rows.
  - Server rejects edits to paid-row `name`/`amount` regardless of payload.
  - Row lifecycle is auditable in persisted event state.

#### Flow 2 — Host initializes event cart for first payment
- Trigger: host clicks purchase on the event product page.
- Experience narrative:
  - Storefront calls a Remix action route that wraps the new Medusa store endpoint.
  - `initializeChefEventCartWorkflow` validates the event, enforces exclusive event cart, computes desired cart contents, and uses `addToCartWorkflow` to atomically reconcile lines.
  - Pending charges become non-removable/non-editable system charge lines.
- Acceptance criteria:
  - Cart contains the requested ticket quantity + one charge line per pending row with canonical metadata.
  - Adding a non-event product or a different event ticket to this cart is rejected by the validate hook.
  - Minimum ticket rule applies while pending charges exist; minimum returns to 1 once all charges are paid.

#### Flow 3 — Post-checkout charge-row transition
- Trigger: `order.placed` event after host completes checkout.
- Experience narrative:
  - Subscriber inspects order items for `metadata.kind === "chef_event_additional_charge"`.
  - Matching pending rows on the linked `ChefEvent` transition to `paid`, with `paid_at` and `paid_order_id`.
  - Refund/cancel remains a manual admin action in v1.
- Acceptance criteria:
  - Transition is idempotent (re-running on the same order is a no-op).
  - Already-paid rows are never modified.
  - Future `initializeChefEventCartWorkflow` invocations omit paid rows.

### Technical Notes & Dependencies
- The current `ChefEventModuleService` (`apps/medusa/src/modules/chef-event/service.ts`) extends `MedusaService` with no custom methods — it is the right place to add charge-row methods.
- `apps/medusa/src/workflows/hooks/` does not yet exist; this plan introduces it.
- Existing `accept-chef-event.ts` workflow already demonstrates the core-flow composition pattern this plan should follow.
- Digital-only cart detection (`apps/storefront/libs/util/cart/cart-helpers.ts`) keys off `requires_shipping === false` or `EVENT-*` SKU prefix; the system charge variant must satisfy at least one path.
- Ticket fulfillment automation (`apps/medusa/src/lib/event-ticket.ts`) keys off `EVENT-*` SKU prefix; charge SKUs must not collide.
- External scope brief: `/Users/pablo/Downloads/private-chef-event-additional-charges.md`.

---

## PART 2: IMPLEMENTATION PLAN

### Scope & Assumptions
- Scope focus: end-to-end v1 for additional charges (admin + backend + storefront + validation + tests).
- Key assumptions:
  - Clarification decisions are final for v1 behavior.
  - Existing accepted-event flow remains the host entrypoint.
  - Manual refund/cancel reconciliation is acceptable for v1.
- Out of scope: automatic refund reversal, mixed carts, post-v1 flexibility controls.

### Implementation Tasks

#### Task 1: Data Model, Service Methods, and Admin Contracts
- **Objective:** Add canonical additional-charge data model on `ChefEvent`, expose lifecycle operations as `ChefEventModuleService` custom methods, and wire admin contracts with server-enforced mutability rules.
- **Impacted Modules/Files:**
  - `apps/medusa/src/modules/chef-event/models/chef-event.ts` — add `additionalCharges: model.json().nullable()`.
  - `apps/medusa/src/modules/chef-event/migrations/<new>.ts` — new migration adding the JSON column (default `null` or `[]`).
  - `apps/medusa/src/modules/chef-event/service.ts` — add custom methods: `setAdditionalCharges`, `addPendingCharge`, `updatePendingCharge`, `voidPendingCharge`, `markChargesPaidByOrder`. All enforce: paid rows immutable for `name`/`amount`; deletes map to `void`; idempotent paid transitions.
  - `apps/medusa/src/api/admin/chef-events/[id]/route.ts` — extend `updateChefEventSchema` with `additionalCharges` Zod shape (`id?`, `name`, `amount` int cents, `status`, optional `notes`, optional `sort_order`). Server-controlled fields (`paid_at`, `paid_order_id`, `created_at`, `updated_at`) excluded from the input schema.
  - `apps/medusa/src/workflows/update-chef-event.ts` — pass `additionalCharges` through; if present, invoke the new `setAdditionalCharges` service method (which delegates to row helpers) instead of directly persisting raw payload.
  - `apps/medusa/src/admin/routes/chef-events/schemas.ts` — extend `chefEventSchema`/`chefEventUpdateSchema` and `getDefaultChefEventValues()` with `additionalCharges`.
  - `apps/medusa/src/sdk/admin/admin-chef-events.ts` — extend `AdminChefEventDTO`, `AdminUpdateChefEventDTO`, and any list/detail responses.
  - `apps/medusa/src/admin/hooks/chef-events.ts` — add types/mutation helpers if needed by the UI in Task 5.
- **References:**
  - Clarification: `clarification/2026-04-29_initial-clarification.md`
  - Research RQ1/RQ5: `research/2026-04-29_chef-event-additional-charges-research.md`
- **Dependencies:** None.
- **Acceptance Criteria:**
  - `ChefEvent` persists `additionalCharges` rows with required row fields.
  - Admin update path validates row payloads and rejects edits to paid-row `name`/`amount`.
  - Pending row deletion in admin payload maps to `status = void` (no row removal from JSON).
  - Service methods are idempotent and the only sanctioned writers of charge rows.
- **Testing Criteria:**
  - Unit tests for service methods covering: add/edit pending, void semantics, paid-row immutability, idempotent `markChargesPaidByOrder`.
  - Integration test on `/admin/chef-events/:id` POST: valid pending updates, rejected paid-row edits, rejected malformed rows.
- **Validation Plan:**
  - Run targeted medusa unit/integration tests.
  - Apply migration locally; verify shape round-trips through service methods.

#### Task 2: System Charge Product/Variant Setup
- **Objective:** Provide a single reusable system charge product/variant, identifiable in code via env var or stable SKU, with `requires_shipping = false` and excluded from storefront catalog listings.
- **Impacted Modules/Files:**
  - `apps/medusa/src/scripts/ensure-system-charge-product.ts` (new) — idempotent script: find-or-create product (handle `system-chef-event-charge`), variant (SKU `SYS-CHEF-CHARGE`), inventory item with `requires_shipping = false` at the existing Digital Location (reuse `lib/digital-stock-location.ts`).
  - `apps/medusa/src/scripts/init.ts` — invoke the ensure step at init time.
  - `apps/medusa/src/lib/system-charge-variant.ts` (new) — `getSystemChargeVariantId(container)` resolver: prefers `process.env.SYSTEM_CHARGE_VARIANT_ID`, falls back to lookup by SKU via `query.graph`.
  - `apps/storefront/libs/util/products.ts` (or equivalent storefront product filtering) — exclude products tagged with `metadata.is_system_product === true` from public listings.
  - Documentation note in task hub `AGENTS.md`.
- **References:**
  - Scope brief sections on the system charge variant.
  - Existing patterns: `apps/medusa/src/scripts/init.ts`, `apps/medusa/src/scripts/fix-event-ticket-inventory-shipping.ts`, `apps/medusa/src/lib/digital-stock-location.ts`.
- **Dependencies:** None (can run in parallel with Task 1).
- **Acceptance Criteria:**
  - Running the ensure script multiple times is safe (no duplicate product/variant).
  - Variant has `requires_shipping = false` so charge lines are detected as digital by `cart-helpers.ts`.
  - Variant SKU is **not** prefixed `EVENT-` and is **not** matched by `isEventTicketSku` in `lib/event-ticket.ts`.
  - Product is excluded from storefront product listings.
- **Testing Criteria:**
  - Unit tests for the resolver helper (env-var path + SKU lookup path).
  - Integration test verifying idempotent run yields exactly one product + variant.
  - Regression assertion that `isEventTicketSku("SYS-CHEF-CHARGE") === false`.
- **Validation Plan:**
  - Run script twice locally and assert single-record outcome.
  - Confirm storefront catalog endpoints do not expose the system product.

#### Task 3: `initializeChefEventCartWorkflow` and Store Route
- **Objective:** Compose tickets + pending charges atomically through Medusa core-flows and expose a store endpoint.
- **Impacted Modules/Files:**
  - `apps/medusa/src/workflows/initialize-chef-event-cart.ts` (new) — `createWorkflow` composing:
    - `useQueryGraphStep` to load chef event (with `additionalCharges`) and event ticket variant from `productId`.
    - `transform(...)` to compute desired cart contents (ticket line + one charge line per `pending` row, quantity 1, `unit_price` from `charge.amount` in cents, canonical `metadata`).
    - `createCartWorkflow` (when no `cart_id` provided) and `addToCartWorkflow` from `@medusajs/medusa/core-flows` for line composition.
    - Custom step (with compensation) to remove stale charge lines for this event before re-adding.
    - Validation steps that throw `MedusaError` for: event not `confirmed`, missing `productId`, requested quantity below first-payment minimum while pending charges exist.
  - `apps/medusa/src/api/store/chef-events/[id]/initialize-cart/route.ts` (new) — Zod-validated POST: `{ quantity: number; cart_id?: string }`. Resolves region from existing helpers and delegates to the workflow.
  - `apps/medusa/src/api/store/chef-events/[id]/route.ts` — extend GET response with `paymentSummary`: `minimumInitialTicketQuantity`, `pendingCharges[]` (id, name, amount), `pendingChargesTotal`, `dueNowMinimumTotal`. No leakage of paid/void rows or server-controlled fields.
  - `apps/medusa/src/sdk/store/store-chef-events.ts` — add `initializeCart(eventId, body)` and update `StoreChefEventDTO` with optional `paymentSummary`.
  - `apps/medusa/src/sdk/store/index.ts` — wire the new SDK method if needed.
  - `apps/medusa/src/lib/chef-event-additional-charges.ts` (new) — pure helpers used by the workflow and the GET route to compute `paymentSummary` consistently.
- **Charge-line metadata (canonical schema):**
  ```
  {
    kind: "chef_event_additional_charge",
    chef_event_id: string,
    chef_event_product_id: string,
    chef_event_charge_id: string,
    charge_name: string,
    via_event_checkout: true
  }
  ```
- **References:**
  - Research RQ2/RQ3, scope brief.
  - Existing pattern: `apps/medusa/src/workflows/accept-chef-event.ts` for core-flow composition style.
- **Dependencies:** Tasks 1 and 2.
- **Acceptance Criteria:**
  - Workflow only adds rows where `status === "pending"`.
  - Workflow re-syncs deterministically: re-running with same input on a cart with existing event lines yields the same final set of lines.
  - Adding a pending row in admin and re-initializing produces a new charge line on the same cart without duplicating existing ones.
  - Workflow rejects (with `MedusaError`) attempts to initialize a cart for a non-confirmed event or without `productId`.
- **Testing Criteria:**
  - Integration tests via `medusaIntegrationTestRunner` covering: pending-only inclusion, paid/void exclusion, idempotent re-run, minimum ticket enforcement (with and without pending charges), payment summary shape.
- **Validation Plan:**
  - Run medusa integration tests for the new route + workflow.
  - Manually verify the `paymentSummary` shape matches the storefront contract from Task 5.

#### Task 4: Cart Validate Hook + Paid-State Subscriber
- **Objective:** Lock in event-cart constraints before lines hit the cart, and reconcile charge-row paid state idempotently after order placement.
- **Impacted Modules/Files:**
  - `apps/medusa/src/workflows/hooks/validate-add-to-cart.ts` (new) — registers `addToCartWorkflow.hooks.validate(...)`. Rejects with `MedusaError` when:
    - A line targets the system charge variant without `metadata.kind === "chef_event_additional_charge"` and `metadata.via_event_checkout === true`.
    - A charge line has `quantity !== 1`.
    - The cart already contains an event ticket line for a different `chef_event_id`.
    - A non-event product is added to a cart that already contains event lines (exclusive event cart).
  - `apps/medusa/src/subscribers/chef-event-charges-paid.ts` (new) — subscribes to `OrderEvents.PLACED`. Loads order items via `query.graph`, filters by `metadata.kind === "chef_event_additional_charge"`, groups by `chef_event_id`, and calls `markChargesPaidByOrder` on `ChefEventModuleService`.
  - `apps/medusa/src/lib/event-ticket.ts` — verify (and assert via test) that `isEventTicketSku` does not match the system charge SKU; no behavior change required.
- **References:**
  - Research RQ4 and clarification decisions.
  - Existing subscriber pattern: `apps/medusa/src/subscribers/event-ticket-payment-captured.ts`.
- **Dependencies:** Tasks 1–3.
- **Acceptance Criteria:**
  - Hook blocks all four invalid scenarios above with descriptive errors.
  - Subscriber transitions only `pending` rows that match metadata to `paid`, sets `paid_at` and `paid_order_id`, and is idempotent on replay.
  - Subscriber failures do not crash order placement (caught + logged), matching the existing `event-ticket-payment-captured` posture.
- **Testing Criteria:**
  - Integration tests for the validate hook covering each rejection branch + a happy-path acceptance.
  - Integration tests for the subscriber: paid transition occurs, replay is no-op, mixed orders (tickets + charges) only mark charge rows.
  - Regression test: ticket auto-fulfillment on `payment.captured` still excludes charge lines.
- **Validation Plan:**
  - Run subscriber + hook integration tests.
  - Manually exercise a full event checkout in a dev environment and confirm row state on the chef event.

#### Task 5: Storefront Event Checkout Flow + Line-Item UI
- **Objective:** Route event purchases through the new initialize-cart endpoint and update cart/checkout rendering to honor charge-line metadata and strict controls.
- **Impacted Modules/Files:**
  - `apps/storefront/app/components/product/EventProductDetails.tsx` — replace direct POST to `/api/cart/line-items/create` for event variants with submission to a new local action route. Render the `paymentSummary` (due now, minimum tickets, pending charges).
  - `apps/storefront/app/routes/api.events.$eventId.initialize-cart.ts` (new local action route) — calls the Medusa store endpoint via `sdk.store.chefEvents.initializeCart`, sets the cart cookie, returns the updated cart + summary.
  - `apps/storefront/libs/util/server/data/chef-events.server.ts` — add a server helper for `initializeCart` if it improves testability.
  - `apps/storefront/app/components/cart/CartDrawerItem.tsx` — render `metadata.charge_name` when `metadata.kind === "chef_event_additional_charge"`; hide remove control for charge lines.
  - `apps/storefront/app/components/checkout/CheckoutOrderSummary/CheckoutOrderSummaryItems.tsx` — same metadata-driven label override; hide remove control for charge lines.
  - `apps/storefront/libs/util/cart/cart-helpers.ts` — extend `hasOnlyDigitalItems` (or equivalent) to also count `metadata.kind === "chef_event_additional_charge"` as digital, in case `requires_shipping` is missing in any line snapshot.
  - `apps/storefront/types/chef-events.ts` — add `paymentSummary` and `additionalCharges` types as exposed by the store route.
- **References:**
  - Research RQ2/RQ3/RQ5.
  - `.cursor/rules/remix-storefront-components.mdc`, `.cursor/rules/remix-storefront-routing.mdc`.
- **Dependencies:** Tasks 3 and 4 (metadata schema and SDK method).
- **Acceptance Criteria:**
  - Event purchase no longer flows through the generic `/api/cart/line-items/create` route.
  - Charge lines display `charge_name` (not the generic system product title) in cart drawer, checkout summary, and order confirmation.
  - Charge lines have no remove/edit controls in v1.
  - Carts containing event tickets + pending charge lines proceed through digital-only checkout (no shipping step or estimated shipping line).
- **Testing Criteria:**
  - Component tests for cart drawer and checkout summary verifying label override and absence of remove control.
  - Route action test for `api.events.$eventId.initialize-cart` happy path + error propagation.
  - Smoke test: full event checkout with charges still resolves to digital-only flow.
- **Validation Plan:**
  - Run storefront tests; manually verify the rendered UI in dev mode.

#### Task 6: Test Hardening and Regression Coverage
- **Objective:** Fill targeted gaps and lock in regression assertions for the highest-risk seams identified during research.
- **Impacted Modules/Files:**
  - `apps/medusa/src/**/__tests__/*` — service method tests, route tests via `medusaIntegrationTestRunner` from `@medusajs/test-utils`, subscriber tests, hook tests.
  - `apps/storefront/**/__tests__/*` — component + route action tests.
  - Existing event-ticket regression suites (extend with charge-line negative cases).
- **References:**
  - `.cursor/rules/testing-patterns-unit.mdc`, `.cursor/rules/testing-patterns-integration.mdc`, `.cursor/rules/testing-patterns-e2e.mdc`.
- **Dependencies:** Tasks 1–5.
- **Acceptance Criteria:**
  - Coverage exists for: paid-row immutability, `void` semantics, idempotent paid transition, exclusive cart enforcement, charge-line label override, digital-only behavior with charge lines, and ticket-automation non-regression.
  - Test names describe behavior (AAA pattern, descriptive names) per `.cursor/rules/testing-patterns-unit.mdc`.
- **Testing Criteria:**
  - Unit tests for pure helpers (row validators, payment summary computation, system charge variant resolver).
  - Integration tests via `medusaIntegrationTestRunner` for routes, workflows, hooks, and subscribers.
  - Targeted UI tests for cart/checkout components that render charge lines.
- **Validation Plan:**
  - Execute medusa and storefront test suites; ensure the new assertions pass and no existing tests regress.

### Implementation Guidance

- **From `.cursor/rules/medusa-development.mdc` — Medusa v2 architecture:**
  - “Workflows: Multi-step business processes with error handling.” Use `createWorkflow`, `createStep`, `WorkflowResponse`, `StepResponse` from `@medusajs/workflows-sdk` (matches existing `apps/medusa/src/workflows/*` style).
  - “Use Zod for runtime validation.” Apply to the admin schema extension in Task 1 and the store route body in Task 3.
  - “Use Medusa error types” (`MedusaError.Types.NOT_ALLOWED`, `NOT_FOUND`) for guardrails in routes, hooks, and service methods.
  - Service Factory: extend `MedusaService({ ChefEvent })` with custom methods (Task 1) — the repo currently has no custom methods, so this is greenfield.

- **From the repo’s existing workflow style (e.g., `apps/medusa/src/workflows/accept-chef-event.ts`):**
  - Compose with core-flows (`createProductsWorkflow`, `createShippingOptionsWorkflow`, `emitEventStep`, etc.). Apply the same pattern in Task 3 with `createCartWorkflow` and `addToCartWorkflow`.

- **Workflow hook registration (Task 4):**
  - Pattern:
    ```ts
    import { addToCartWorkflow } from "@medusajs/medusa/core-flows"
    addToCartWorkflow.hooks.validate(async ({ items, cart }, { container }) => {
      // throw MedusaError on guard violations
    })
    ```
  - Place under `apps/medusa/src/workflows/hooks/<descriptive-name>.ts`. Medusa loads files under this convention automatically when imported by the framework.

- **Subscriber pattern (Task 4):**
  - Mirror `apps/medusa/src/subscribers/event-ticket-payment-captured.ts`: validate payload shape, swallow errors with logging, never throw out of the handler.
  - Use `OrderEvents.PLACED` from `@medusajs/framework/utils` for the event name.

- **From `.cursor/rules/remix-storefront-components.mdc` and `.cursor/rules/remix-storefront-routing.mdc`:**
  - Keep storefront components type-safe and reusable; use Remix action routes for server-side orchestration of the store SDK call (Task 5).

- **From `.cursor/rules/testing-patterns-unit.mdc`, `testing-patterns-integration.mdc`, `testing-patterns-e2e.mdc`:**
  - AAA pattern, descriptive behavior-focused test names, isolated tests.
  - Use `medusaIntegrationTestRunner` from `@medusajs/test-utils` for API/workflow/subscriber integration tests.

- **From clarification decisions:**
  - Strict v1 guardrails: exclusive carts, non-removable charges, paid-row immutability, `void` soft-delete, manual refund reconciliation.

---

## Risks & Open Questions

| Item | Type (Risk / Question) | Owner | Mitigation / Next Step | Due |
| --- | --- | --- | --- | --- |
| Charge lines collide with ticket automation via SKU conventions | Risk | Implementer | System charge SKU intentionally non-`EVENT-*`; add explicit assertion `isEventTicketSku("SYS-CHEF-CHARGE") === false`. | During implementation |
| Shipping step reappears for event carts with charge lines | Risk | Implementer | Set `requires_shipping = false` on system charge variant (Task 2) and extend `cart-helpers.ts` to also accept `metadata.kind === "chef_event_additional_charge"` (Task 5). Regression test in Task 6. | During implementation |
| `addToCartWorkflow.hooks.validate` is registered twice or not registered at all | Risk | Implementer | Place exactly one hook file under `workflows/hooks/`; cover registration with a happy-path integration test in Task 6. | During implementation |
| Paid-state subscriber races with same event being re-initialized | Risk | Implementer | `markChargesPaidByOrder` is idempotent and only transitions `pending` → `paid`; subscriber is safe to replay. | During implementation |
| Manual refund reconciliation may cause inconsistent operational handling | Risk | Product owner | Document operational guidance in implementation notes and follow-up task for automation. | Post-v1 |
| Money representation drifts between cents and dollars | Risk | Implementer | Pin charge `amount` to integer cents end-to-end; assert in unit tests for the payment summary helper and admin schema. | During implementation |
| Store and admin DTO drift across SDK/hooks/routes | Risk | Implementer | Update DTOs/schemas/contracts in same task slice as model changes; cover with API contract assertions. | During implementation |

---

## Progress Tracking
Refer to `.devagent/workspace/tasks/active/2026-04-29_chef-event-additional-charges/AGENTS.md` for implementation progress tracking instructions.

---

## Appendices & References
- Clarification packet: `.devagent/workspace/tasks/active/2026-04-29_chef-event-additional-charges/clarification/2026-04-29_initial-clarification.md`
- Research packet: `.devagent/workspace/tasks/active/2026-04-29_chef-event-additional-charges/research/2026-04-29_chef-event-additional-charges-research.md`
- Scope brief: `/Users/pablo/Downloads/private-chef-event-additional-charges.md`
- Related project docs:
  - `.devagent/AGENTS.md`
  - `.cursor/rules/medusa-development.mdc`
  - `.cursor/rules/remix-storefront-components.mdc`
  - `.cursor/rules/remix-storefront-routing.mdc`
  - `.cursor/rules/testing-patterns-unit.mdc`
  - `.cursor/rules/testing-patterns-integration.mdc`
  - `.cursor/rules/testing-patterns-e2e.mdc`
- Repo references:
  - `apps/medusa/src/workflows/accept-chef-event.ts` — core-flow composition style
  - `apps/medusa/src/subscribers/event-ticket-payment-captured.ts` — subscriber posture
  - `apps/medusa/src/modules/chef-event/service.ts` — module service extension point
  - `apps/medusa/src/lib/event-ticket.ts` — ticket SKU detection (must not match charges)
  - `apps/medusa/src/lib/digital-stock-location.ts` — digital location helper for system charge inventory
  - `apps/storefront/libs/util/cart/cart-helpers.ts` — digital-only detection
  - `apps/storefront/app/components/cart/CartDrawerItem.tsx` and `CheckoutOrderSummaryItems.tsx` — line-item rendering
