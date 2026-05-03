# Chef Event Additional Charges Progress Tracker

- Owner: PabloJVelez
- Last Updated: 2026-05-03
- Status: Draft
- Task Hub: `.devagent/workspace/tasks/active/2026-04-29_chef-event-additional-charges/`

## Summary

We need to support the chef being able to add **additional charges** to a chef event—charges that are defined per event, shown to the host on the **first payment** for that event, billed **once per charge row**, and then hidden for that row after a successful purchase—while staying inside the existing **Medusa cart / checkout / order** flow (not draft orders or a parallel invoicing system).

The recommended architecture (see References) is: extend `ChefEvent` with a JSON array of charge rows, each with its own lifecycle (`pending` | `paid` | `void`), **not** a single global “additional charges paid” flag; introduce a **reusable system charge variant** with `unit_price` overrides and rich **line-item metadata** (`kind: chef_event_additional_charge`, event id, charge id, display name); add a **dedicated store route and Medusa workflow** (e.g. initialize event cart) that validates the event, enforces minimum initial ticket quantity when pending charges exist, syncs the cart with ticket lines plus one line per unpaid charge, and **marks charge rows paid** when an order is created containing those lines; replace the storefront’s generic event add-to-cart with a call into that flow; add **defense-in-depth** via `addToCartWorkflow` validation hooks; update cart/checkout/receipt/email line labels to prefer `metadata.charge_name` for charge lines; keep **digital-only checkout** behavior for charge lines; and avoid conflating charge payment with coarse `depositPaid` or with **ticket SKU–based fulfillment** logic (charges should be distinguishable by metadata/SKU convention).

## Agent Update Instructions

- Always update "Last Updated" to today's date (ISO: YYYY-MM-DD) when editing this file. **Get the current date by explicitly running `date +%Y-%m-%d` first, then use the output for the "Last Updated" field.**
- Progress Log: Append a new entry at the end in the form `- [YYYY-MM-DD] Event: concise update, links to files`. Do not rewrite or delete prior entries. **Use the date retrieved from `date +%Y-%m-%d` for the date portion.**
- Implementation Checklist: Mark items as `[x]` when complete, `[~]` for partial with a short note. Add new items if discovered; avoid removing items—strike through only when obsolete.
- Key Decisions: Record important decisions as `- [YYYY-MM-DD] Decision: rationale, links`. **Use the date retrieved from `date +%Y-%m-%d` for the date portion.**
- References: Keep links current to latest spec, research, and tasks. Add additional references as they are created.
- Scope: Edits here should reflect coordination/progress only; do not include application code changes. Preserve history.

## Key Decisions

- [2026-04-29] Decision: v1 cart policy is exclusive event carts (one event per cart, no mixed catalog items). Source: clarification packet Q2.
- [2026-04-29] Decision: Charge-line UX is strict in v1 — host cannot remove or edit one-time charge lines in cart. Source: clarification packet Q3.
- [2026-04-29] Decision: Refund/cancel reconciliation is manual case-by-case in v1; no automatic reverse transition. Source: clarification packet Q1.
- [2026-04-29] Decision: Paid charge rows are immutable in admin (`name`/`amount` read-only) and pending-row delete maps to `status = void`. Source: clarification packet Q5/Q6.
- [2026-04-29] Decision: Charge `amount` is stored as integer cents to match Medusa core conventions (`unit_price`, `payment.amount`). Source: plan review.
- [2026-04-29] Decision: Charge lines are identified by `metadata.kind === "chef_event_additional_charge"` plus `chef_event_id` / `chef_event_charge_id`; SKU is intentionally not `EVENT-*` to avoid ticket-automation overlap. Source: plan review.
- [2026-04-29] Decision: `initializeChefEventCartWorkflow` composes Medusa core-flows (`createCartWorkflow`, `addToCartWorkflow`, `useQueryGraphStep`); the `addToCartWorkflow.hooks.validate(...)` hook enforces strict event-cart rules; the `OrderEvents.PLACED` subscriber reconciles paid-state transitions. Source: plan review.
- [2026-05-03] Decision: For cart line removal during reconcile, use `deleteLineItemsWorkflow` (which wraps `acquireLockStep` → `deleteLineItemsStep` → `refreshCartItemsWorkflow` → `cart.updated` event) instead of resolving `Modules.CART` directly, so totals stay coherent and downstream subscribers are notified. Source: pattern-review pass.

## Progress Log

- [2026-04-29] Event: Task hub scaffolded from user request and external scope document; ready for clarification, research, and planning workflows.
- [2026-04-29] Event: Clarification session completed; key policy decisions captured (exclusive carts, strict charge-line controls, paid-row immutability, `void` soft-delete, manual refund reconciliation) in `clarification/2026-04-29_initial-clarification.md`.
- [2026-04-29] Event: Research workflow completed with code-path analysis and planning recommendations in `research/2026-04-29_chef-event-additional-charges-research.md`.
- [2026-04-29] Event: Create-plan workflow completed; implementation plan authored at `plan/2026-04-29_chef-event-additional-charges-implementation-plan.md` with 5 execution-focused task slices and validation criteria.
- [2026-04-29] Event: Plan refined for Medusa v2 best practices — promoted system charge product/variant to its own task (now 6 tasks total), pinned money to integer cents, specified `addToCartWorkflow.hooks.validate` and `OrderEvents.PLACED` subscriber patterns, added `ChefEventModuleService` custom methods, and locked the charge-line metadata schema.
- [2026-04-29] Event: Implement-plan execution (Tasks 1-5 partial) completed for backend + storefront wiring — added `ChefEvent.additionalCharges` model + migration + service lifecycle methods, admin schema/API/workflow/SDK updates, system charge product ensure script + resolver + init wiring, `initialize-chef-event-cart` workflow and store route, add-to-cart validate hook + `order.placed` paid-state subscriber, storefront event initialize-cart action route, and cart/checkout metadata-based charge rendering. Validation: `yarn workspace medusa typecheck` passed; root/storefront typecheck has unrelated pre-existing failures outside this task.
- [2026-04-29] Event: Added payment-summary UI on event product page and backend unit coverage in `apps/medusa/src/lib/__tests__/chef-event-additional-charges.unit.spec.ts`; reran `yarn workspace medusa typecheck` and `yarn workspace medusa test:unit` (both passing).
- [2026-04-29] Event: Completed remaining hardening pass — initialize-cart now reconciles existing event ticket and additional-charge line items (updates existing quantities/prices/metadata instead of repeatedly adding), storefront product list filtering now excludes `metadata.is_system_product === true`, and checkout success now displays additional-charge labels from `metadata.charge_name`; validated again with `yarn workspace medusa typecheck` and `yarn workspace medusa test:unit`.
- [2026-04-29] Event: Added stale-line cleanup and email line rendering alignment — initialize-cart now deletes charge line items that no longer map to pending rows, and order placed email rendering now prefers `metadata.charge_name` for additional-charge lines; backend validation remains green.
- [2026-05-03] Event: Pattern review pass aligned the feature with Medusa v2 conventions — `initialize-chef-event-cart` now goes through `deleteLineItemsWorkflow` (proper `cart.updated` events + cart refresh) instead of resolving `Modules.CART` directly, removed `as any` casts on sub-workflow inputs and added explicit row-shape types around `query.graph`; store `GET /store/chef-events/:id` and the `order.placed` subscriber now resolve `ChefEventModuleService` via the `CHEF_EVENT_MODULE` constant with the typed service; `validate-add-to-cart` hook tightened to typed item shapes; storefront `EventProductDetails` typed against the shared `StoreChefEventDTO`/`paymentSummary` rather than `any`; `QuantitySelector` debug `console.log` dropped. Validated with `yarn workspace medusa typecheck` and `yarn workspace medusa test:unit` (passing); storefront typecheck only surfaces pre-existing unrelated errors.

## Implementation Checklist

- [x] Model & migration: `ChefEvent.additionalCharges` JSON array with per-row `id`, `name`, `amount`, `status`, timestamps, `paid_order_id`, etc.; align DTOs/SDK/admin types.
- [x] Admin API & workflow: allow validated updates to charge rows; integrate `update-chef-event`; paid/void semantics and server-controlled fields.
- [x] Admin UI: “Additional charges” section on chef event detail; pending editable, paid read-only, void hidden from storefront; optional soft-delete via `void`.
- [x] Catalog: seed or document **system charge** product/variant (`is_system_product`, `kind: chef_event_additional_charge`); storefront filtering if needed.
- [x] Store API & workflow: `initialize-chef-event-cart` (or equivalent) — validate event, minimum ticket qty when pending charges, sync cart (ticket qty + one charge line per pending row with `unit_price` + metadata).
- [x] Hooks/subscribers: post-order (or complete-cart) path to mark matching charge rows `paid` idempotently; `addToCartWorkflow` validate hook blocking bogus charge lines.
- [x] Storefront: replace generic `/api/cart/line-items/create` for event purchases with event init flow; payment summary UI (“Due now”, pending charges, minimum tickets).
- [x] Rendering: cart drawer, checkout summary, confirmation, emails — display `metadata.charge_name` when `metadata.kind === "chef_event_additional_charge"`; digital-only cart helpers extended if needed.
- [~] Tests: backend (cart sync, validation, paid transitions), storefront (copy, minimum qty, labels, digital-only), regressions (fulfillment/ticket automation, shipping). (Backend typecheck + unit tests pass, including new helper coverage; integration/subscriber/storefront regression tests still pending.)

## Open Questions

- (Resolved in clarification packet) v1 uses manual case-by-case refund reconciliation and exclusive event carts.

## References

- [2026-04-29] `/Users/pablo/Downloads/private-chef-event-additional-charges.md` — External full-scope brief: Medusa-native design, data model, file checklist, testing and edge cases (authoritative input for this task).
- [2026-04-29] `.devagent/workflows/new-task.md` — Workflow for scaffolding task hubs.
- [2026-04-29] `.devagent/AGENTS.md` — Project-level workflow roster and standard instructions.
- [2026-04-29] `.devagent/workspace/product/mission.md` — Client-template mission context for private-chef features.
- [2026-04-29] `.devagent/workspace/tasks/completed/2026-03-28_event-tickets-fulfillment-and-shipping-admin/` — Prior research on event tickets, acceptance flow, and fulfillment patterns.
- [2026-04-29] `.devagent/workspace/tasks/active/2026-03-17_digital-only-checkout-shipping-display/AGENTS.md` — Related digital-only cart/checkout behavior for event-style purchases.
- [2026-04-29] `.devagent/workspace/tasks/completed/2026-04-26_event-menu-template-derivation/AGENTS.md` — Chef event admin and workflow extension patterns in this repo.

## Next Steps

Recommended follow-up workflows (run from repo root where `devagent` is available):

- `devagent implement-plan` — Execute plan tasks from `plan/2026-04-29_chef-event-additional-charges-implementation-plan.md`.
