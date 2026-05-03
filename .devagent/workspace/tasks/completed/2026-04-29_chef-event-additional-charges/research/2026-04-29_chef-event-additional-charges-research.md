# Research Packet — Chef Event Additional Charges

- Mode: Task
- Requested By: PabloJVelez
- Last Updated: 2026-04-29
- Related Plan: (not created yet)
- Storage Path: `.devagent/workspace/tasks/completed/2026-04-29_chef-event-additional-charges/research/2026-04-29_chef-event-additional-charges-research.md`
- Stakeholders: PabloJVelez (Owner / Decision Maker)

## Request Overview

### Inferred Problem Statement
Enable chefs to add event-scoped one-time additional charges that are collected through the existing accepted-event Medusa checkout flow, while preserving event-ticket automation and digital-only checkout behavior.

### Assumptions
- [INFERRED] This research is for task `2026-04-29_chef-event-additional-charges` created in the current session.
- [INFERRED] Clarified decisions in `clarification/2026-04-29_initial-clarification.md` are authoritative for v1 scope.
- [INFERRED] Research consumer is `devagent create-plan`.

## Context Snapshot
- Task summary: One-time per-row additional charges on `ChefEvent` with strict cart behavior, immutable paid rows, and `void` soft-delete.
- Task reference: `.devagent/workspace/tasks/completed/2026-04-29_chef-event-additional-charges/`
- Existing decisions: `.devagent/workspace/tasks/completed/2026-04-29_chef-event-additional-charges/clarification/2026-04-29_initial-clarification.md`

## Research Questions
| ID | Question | Status (Planned / Answered / Follow-up) | Notes |
| --- | --- | --- | --- |
| RQ1 | Where should additional-charge state live and how does current model/API support it? | Answered | `ChefEvent` model/API/workflow are current extension point. |
| RQ2 | What is the current storefront purchase flow for event products and where to intercept it? | Answered | Current flow posts to generic line-item route; needs event-specific init route. |
| RQ3 | What existing checkout/cart behavior must be preserved for digital/event purchases? | Answered | Digital-only logic depends on `requires_shipping === false` or `EVENT-*` SKU conventions. |
| RQ4 | What existing event automation could regress if charge lines mimic event tickets? | Answered | Ticket fulfillment/capture logic keys off `EVENT-*` SKUs and event product relations. |
| RQ5 | Which data contracts must be updated (admin/store SDK + schemas)? | Answered | Admin schemas and DTOs require additional charge fields and mutability rules. |

## Key Findings
- `ChefEvent` already stores several event-specific JSON fields (`emailHistory`, `customEmailRecipients`), so adding `additionalCharges` as JSON aligns with current model patterns.
- Admin update path is centralized in `api/admin/chef-events/[id]/route.ts` + `update-chef-event` workflow, which is the right enforcement point for paid-row immutability and `void` semantics.
- Storefront event purchase currently submits to `/api/cart/line-items/create`, which resolves one variant and quantity only; this cannot express multi-line event cart composition (tickets + pending charges).
- Digital-only checkout logic is sensitive to line-item `requires_shipping` and `EVENT-*` SKU patterns; new charge lines must remain digital and must not accidentally look like event tickets.
- Cart and checkout item rendering currently display `product_title`/`variant_title` and always show remove controls; charge-line metadata-driven labels and strict non-removable behavior require targeted UI updates.

## Detailed Findings

### RQ1 — Model and backend extension points
**Summary answer:** `ChefEvent` is the correct source of truth for additional charges, and the existing admin update workflow is the right place to enforce row-state rules.

**Evidence:**
- `ChefEvent` model already contains domain fields plus JSON columns such as `emailHistory` and `customEmailRecipients`: `apps/medusa/src/modules/chef-event/models/chef-event.ts`.
- Admin detail update endpoint validates and forwards fields to a single workflow: `apps/medusa/src/api/admin/chef-events/[id]/route.ts`.
- Update workflow handles domain guardrails and centralizes persistence (`updateChefEvents`): `apps/medusa/src/workflows/update-chef-event.ts`.

**Freshness:** repository state as of 2026-04-29.

### RQ2 — Storefront purchase interception point
**Summary answer:** current event checkout entrypoint is generic line-item creation; additional-charge orchestration needs a new event-specific route/workflow.

**Evidence:**
- `EventProductDetails` posts directly to `/api/cart/line-items/create`: `apps/storefront/app/components/product/EventProductDetails.tsx`.
- Current route adds only one resolved variant + quantity: `apps/storefront/app/routes/api.cart.line-items.create.ts`.
- Cart server helper `addToCart` similarly supports only `{ variantId, quantity }`: `apps/storefront/libs/util/server/data/cart.server.ts`.

**Freshness:** repository state as of 2026-04-29.

### RQ3 — Digital-only checkout constraints
**Summary answer:** charge lines must preserve digital-only signals or checkout may wrongly require shipping.

**Evidence:**
- Digital-only detection uses line-item `requires_shipping === false` OR `variant_sku` prefix `EVENT-`: `apps/storefront/libs/util/cart/cart-helpers.ts`.
- Checkout flow suppresses delivery step only when cart is digital-only: `apps/storefront/app/components/checkout/CheckoutFlow.tsx`.
- Order summary shipping rows are also gated by digital-only detection: `apps/storefront/app/components/checkout/CheckoutOrderSummary/CheckoutOrderSummaryTotals.tsx`.

**Freshness:** repository state as of 2026-04-29.

### RQ4 — Event ticket automation regression risks
**Summary answer:** existing fulfillment/capture automation is ticket-specific; additional-charge lines must stay distinguishable to avoid false fulfillment behavior.

**Evidence:**
- Event ticket detection relies on `EVENT-*` SKU conventions: `apps/medusa/src/lib/event-ticket.ts`.
- Payment-captured subscriber auto-fulfills event ticket lines after capture: `apps/medusa/src/subscribers/event-ticket-payment-captured.ts`.
- Fulfillment workflow filters unfulfilled ticket lines by ticket SKU and creates digital fulfillment records: `apps/medusa/src/workflows/fulfill-event-ticket-lines.ts`.
- Accepted-event email currently frames deposit/minimum tickets behavior, reinforcing event-ticket semantics: `apps/medusa/src/subscribers/chef-event-accepted.ts`.

**Freshness:** repository state as of 2026-04-29.

### RQ5 — Contract and UI surfaces requiring updates
**Summary answer:** admin/store DTOs and rendering components need explicit additional-charge support.

**Evidence:**
- Admin DTOs and update input currently omit additional-charge fields: `apps/medusa/src/sdk/admin/admin-chef-events.ts`.
- Admin form schema currently includes core fields only: `apps/medusa/src/admin/routes/chef-events/schemas.ts`.
- Store chef-event detail API response currently does not include additional-charge/payment summary fields: `apps/medusa/src/api/store/chef-events/[id]/route.ts`.
- Checkout/cart item rows render `product_title` + `variant_title` and expose remove action: `apps/storefront/app/components/checkout/CheckoutOrderSummary/CheckoutOrderSummaryItems.tsx`, `apps/storefront/app/components/cart/CartDrawerItem.tsx`.

**Freshness:** repository state as of 2026-04-29.

## Comparative / Alternatives Analysis

- **Option A — Extend current generic cart line-item route:** low change surface but cannot atomically synchronize ticket + multiple charge rows with domain validation.
- **Option B — New event initialize-cart route/workflow (recommended):** aligns with clarified requirements and supports strict policy controls (exclusive cart, non-removable charge lines, one-time row transitions).
- **Option C — Draft-order-first approach:** conflicts with current storefront product-link purchase flow and clarified scope.

## Implications for Implementation

- Plan should treat `ChefEvent.additionalCharges[]` as canonical domain state and enforce row-state mutability server-side.
- Plan should introduce a dedicated Medusa store route/workflow for event cart initialization, then switch storefront event checkout to that route.
- Plan should include explicit digital-only compatibility tasks for charge lines.
- Plan should include explicit anti-regression checks for ticket SKU-based fulfillment/capture flows.
- Plan should include UI tasks for metadata-based line-item naming and strict non-removable charge rows.

## Risks & Open Questions
| Item | Type (Risk / Question) | Owner | Mitigation / Next Step | Due |
| --- | --- | --- | --- | --- |
| Charge lines accidentally detected as ticket lines (SKU overlap) | Risk | Implementer | Use distinct metadata kind and non-ticket SKU convention; add regression tests around ticket fulfillment automation. | In planning |
| Shipping step appears for charge lines | Risk | Implementer | Ensure charge lines are treated as digital (`requires_shipping=false` or equivalent path); add checkout regression tests. | In planning |
| Refund/cancel reconciliation is manual in v1 | Risk | Product owner | Document admin runbook and audit expectations in plan; defer automation to follow-up task. | In planning |
| Store API detail payload lacks payment summary fields | Risk | Implementer | Add explicit DTO contract changes in plan and tests for response shape. | In planning |

## Recommended Follow-ups
- Run `devagent create-plan` using this packet plus the clarification packet.
- Include a dedicated implementation task for cart composition workflow (ticket + pending charges) and route wiring.
- Include acceptance tests for:
  - exclusive event carts,
  - strict non-removable charge lines,
  - paid-row immutability + `void` soft-delete,
  - digital-only checkout behavior,
  - no regression in event ticket auto-fulfillment/capture.

## Sources
| Reference | Type | Freshness | Access Notes |
| --- | --- | --- | --- |
| `.devagent/workspace/tasks/completed/2026-04-29_chef-event-additional-charges/clarification/2026-04-29_initial-clarification.md` | Internal artifact | 2026-04-29 | Authoritative requirement decisions |
| `/Users/pablo/Downloads/private-chef-event-additional-charges.md` | External brief (local doc) | 2026-04-29 | User-provided scope brief |
| `apps/medusa/src/modules/chef-event/models/chef-event.ts` | Code | 2026-04-29 | Current model capabilities |
| `apps/medusa/src/api/admin/chef-events/[id]/route.ts` | Code | 2026-04-29 | Admin update boundary |
| `apps/medusa/src/workflows/update-chef-event.ts` | Code | 2026-04-29 | Domain update workflow |
| `apps/storefront/app/components/product/EventProductDetails.tsx` | Code | 2026-04-29 | Current event purchase entrypoint |
| `apps/storefront/app/routes/api.cart.line-items.create.ts` | Code | 2026-04-29 | Generic add-to-cart implementation |
| `apps/storefront/libs/util/server/data/cart.server.ts` | Code | 2026-04-29 | Cart data operations |
| `apps/storefront/libs/util/cart/cart-helpers.ts` | Code | 2026-04-29 | Digital-only cart detection |
| `apps/storefront/app/components/checkout/CheckoutFlow.tsx` | Code | 2026-04-29 | Shipping step gating |
| `apps/storefront/app/components/checkout/CheckoutOrderSummary/CheckoutOrderSummaryTotals.tsx` | Code | 2026-04-29 | Shipping totals rendering |
| `apps/medusa/src/lib/event-ticket.ts` | Code | 2026-04-29 | Ticket-line detection |
| `apps/medusa/src/subscribers/event-ticket-payment-captured.ts` | Code | 2026-04-29 | Capture-triggered auto-fulfillment |
| `apps/medusa/src/workflows/fulfill-event-ticket-lines.ts` | Code | 2026-04-29 | Ticket fulfillment logic |
| `apps/storefront/app/components/checkout/CheckoutOrderSummary/CheckoutOrderSummaryItems.tsx` | Code | 2026-04-29 | Line-item label/remove UI |
| `apps/storefront/app/components/cart/CartDrawerItem.tsx` | Code | 2026-04-29 | Cart drawer label/remove UI |
