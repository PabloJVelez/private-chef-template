# Port Stripe Connect, Admin Onboarding, and Configurable Platform Fees — Progress Tracker

- Owner: PabloJVelez
- Last Updated: 2026-03-09
- Status: Draft
- Task Hub: `.devagent/workspace/tasks/active/2026-03-09_port-stripe-connect-and-admin-onboarding/`

## Summary

This task ports three related Stripe Connect features from a sibling chef project into this parent template project.

**1. Stripe Connect payment provider.** Replace the standard Stripe payment provider with a custom Stripe Connect provider so the platform (developer's Stripe account) can collect a configurable application fee on every transaction, with the remainder routed to a connected chef/vendor account via destination charges. The provider supports a `USE_STRIPE_CONNECT` env toggle (standard Stripe when false), config-driven fee percentage (`PLATFORM_FEE_PERCENT`), Connect-aware refunds (`REFUND_APPLICATION_FEE`), currency-aware amount conversion, and webhook handling for Connect events. The provider id changes from `pp_stripe_stripe` to `pp_stripe-connect_stripe-connect`, requiring updates across medusa-config, storefront, and seed scripts.

**2. Admin onboarding for the connected account.** Replace the static `STRIPE_CONNECTED_ACCOUNT_ID` env var with a DB-backed admin flow so operators can create, onboard, and manage the connected Stripe account through a dedicated Medusa admin UI page (`/app/stripe-connect`). This includes a `stripe_connect_account` data model/module, admin API routes (status + account-link), a webhook for `account.updated`, and updates to the payment provider to resolve the connected account from the database at payment time instead of from env.

**3. Configurable platform fee modes for events and products.** Extend the single `PLATFORM_FEE_PERCENT` into config-driven per-line fee calculation so the platform can charge differently for event items (e.g. a fixed dollar amount per ticket) versus product items (e.g. a percentage of the item value). In the sibling project this distinguished "tickets" (SKU prefix `EVENT-*`) from "bento boxes" (everything else); in this template the concept generalizes to events vs products, with the specific product types and SKU conventions determined per-chef project. The fee logic resolves cart line items, classifies each by type, applies per-type mode and amount, and aggregates into a single `application_fee_amount` compatible with Stripe Connect. When line data is unavailable, it falls back to the existing percentage-of-total behavior.

All three features are already implemented and proven in the sibling project. The goal is to port them into this template so future chef projects inherit a complete Stripe Connect + onboarding + configurable-fee setup with minimal per-chef customization.

## Agent Update Instructions
- Always update "Last Updated" to today's date (ISO: YYYY-MM-DD) when editing this file. **Get the current date by explicitly running `date +%Y-%m-%d` first, then use the output for the "Last Updated" field.**
- Progress Log: Append a new entry at the end in the form `- [YYYY-MM-DD] Event: concise update, links to files`. Do not rewrite or delete prior entries. **Use the date retrieved from `date +%Y-%m-%d` for the date portion.**
- Implementation Checklist: Mark items as `[x]` when complete, `[~]` for partial with a short note. Add new items if discovered; avoid removing items—strike through only when obsolete.
- Key Decisions: Record important decisions as `- [YYYY-MM-DD] Decision: rationale, links`. **Use the date retrieved from `date +%Y-%m-%d` for the date portion.**
- References: Keep links current to latest spec, research, and tasks. Add additional references as they are created.
- Scope: Edits here should reflect coordination/progress only; do not include application code changes. Preserve history.

## Key Decisions
- [Date] Decision: Description, rationale, links to supporting docs.

## Progress Log
- [2026-03-09] Event: Task hub created to port the Stripe Connect payment provider, admin onboarding, and configurable platform fee features from the sibling chef project into this parent template repo; see References and Embedded References for prior task docs.
- [2026-03-09] Event: Task 1 initial backend wiring completed — added `apps/medusa/src/modules/stripe-connect/*` and updated `apps/medusa/medusa-config.ts` to use the new provider.
- [2026-03-09] Event: Task 2 initial admin stack wiring completed — added `apps/medusa/src/modules/stripe-connect-account/*` and registered the module in `apps/medusa/medusa-config.ts`.

## Implementation Checklist
- [x] Task 1: Port the Stripe Connect payment provider and related configuration (custom provider module, types, currency util, env/config updated in medusa-config; storefront provider-id wiring and seed scripts pending for later task).
- [~] Task 2: Port the Stripe Connect admin onboarding stack (DB model/module wired; admin API routes, webhook, provider integration usage, admin UI, and env/docs cleanup still pending).
- [ ] Task 3: Port the configurable platform fee logic (per-line fee calculation for events vs products, env vars for fee modes and amounts, cart line-item resolution, fallback to percentage-of-total, unit tests).
- [ ] Task 4: Generalize sibling-project-specific details (e.g. "bento" references, SKU conventions) so the template expresses events vs products cleanly and per-chef projects can define their own product types.
- [ ] Task 5: Update shared documentation and onboarding/runbook material so future chef projects can follow a clear Stripe Connect + onboarding + configurable-fee setup flow.

## Open Questions
- What, if any, differences between this parent template and the sibling chef project (routes, env names, deployment shape) require adapting the implementations instead of copying them directly?
- How should this template express the default platform fee, refund behavior, and any Connect toggles so per-chef projects can override them cleanly without forking core code?
- What product-type classification strategy should the template use (SKU prefix, product tag/attribute, or config-based mapping) so it's easy for each chef project to define "event" vs "product"?

## References
- [2026-03-09] `.devagent/workspace/product/mission.md` — High-level mission for this monorepo (Medusa 2 + Remix + Stripe) as the canonical starter template, confirming Stripe is a core part of the stack.
- [2026-03-09] `.devagent/workspace/product/roadmap.md` — Roadmap notes Horizon 1 foundation including Stripe payment integration, providing product context for payment-related improvements.
- [2026-03-09] `.devagent/workspace/tasks/completed/2026-03-08_document-templatized-values-and-onboarding-runbook/research/2026-03-09_templatized-values-inventory.md` — Documents env setup steps mentioning `STRIPE_*` variables and Stripe test-mode checkout, useful for aligning Stripe Connect onboarding with existing onboarding/runbook guidance.
- [2026-03-09] `.devagent/workspace/tasks/completed/2026-03-08_document-templatized-values-and-onboarding-runbook/plan/2026-03-09_plug-in-chef-docs-plan.md` — Plan describes Stripe-related onboarding steps (env, seed, Stripe test mode and first mock order) that this task should keep compatible when adding Stripe Connect and admin onboarding.
- [External, 2026-03-02] Completed Stripe Connect task hub (sibling chef project) — AGENTS and plan documents describing the custom Stripe Connect provider (application fees, `USE_STRIPE_CONNECT` toggle, provider id `pp_stripe-connect_stripe-connect`) and related env/docs, provided in this conversation.
- [External, 2026-03-03] Completed Stripe admin onboarding task hub (sibling chef project) — AGENTS and plan documents describing DB-backed Stripe Connect account model/module, admin API and webhook, payment provider integration, and admin UI onboarding flow, provided in this conversation.
- [External, 2026-03-07] Configurable platform fee mode (sibling chef project) — AGENTS and implementation plan describing config-driven per-line fee calculation (events vs products, per-unit or percentage mode), cart line-item resolution, and fallback to percentage-of-total; provided in this conversation.

---

## Embedded Reference — Stripe Connect AGENTS (Sibling Project)

> The following is the full AGENTS.md from the sibling project's completed Stripe Connect task, preserved here as implementation reference for porting.

- Owner: PabloJVelez
- Last Updated: 2026-03-03
- Status: Complete
- Task Hub: `.devagent/workspace/tasks/completed/2026-03-02_stripe-connect/`

**Summary:** Implement Stripe Connect so the platform can collect a configurable application fee (e.g. 5%) on transactions, with the remainder transferred to a connected account. Uses destination charges, `application_fee_amount`, `transfer_data[destination]`, optional `on_behalf_of`. Platform account = merchant of record; connected account receives the remainder. Config-driven fee percentage, refund behavior (`REFUND_APPLICATION_FEE`), and optional Stripe fee pass-through. Provider identifier `stripe-connect` (Medusa provider ID `pp_stripe-connect_stripe-connect`). Currency-aware amount conversion and webhook handling for Connect events.

**Key implementation details:**
- Custom Stripe Connect provider types, service (AbstractPaymentProvider), and `get-smallest-unit` util in `apps/medusa/src/modules/stripe-connect/`
- Module index exports provider; payment module resolves `./src/modules/stripe-connect` with id `stripe-connect`
- medusa-config uses stripe-connect provider with options from env; .env.template extended with `USE_STRIPE_CONNECT`, `STRIPE_CONNECTED_ACCOUNT_ID`, `PLATFORM_FEE_PERCENT`, `REFUND_APPLICATION_FEE`, `STRIPE_WEBHOOK_SECRET`, `PASS_STRIPE_FEE_TO_CHEF`, `STRIPE_FEE_*`
- Replaced all `pp_stripe_stripe` with `pp_stripe-connect_stripe-connect` in storefront (StripeElementsProvider, StripePaymentForm, CheckoutPayment, StripeExpressPaymentForm, cart.server, api.checkout.shipping-methods, api.checkout.complete) and seed scripts (seed.ts, seed-menus.ts)

---

## Embedded Reference — Stripe Admin Onboarding AGENTS (Sibling Project)

> The following is the full AGENTS.md from the sibling project's completed Stripe admin onboarding task, preserved here as implementation reference for porting.

- Owner: PabloJVelez
- Last Updated: 2026-03-04
- Status: Complete
- Task Hub: `.devagent/workspace/tasks/completed/2026-03-03_implement-stripe-admin-onboarding/`

**Summary:** Replace the static `STRIPE_CONNECTED_ACCOUNT_ID` env var with a DB-backed, admin-driven Stripe Connect onboarding flow. Admins configure the connected account via a dedicated Medusa admin page and Stripe's hosted onboarding; the payment provider resolves the connected account from the database at payment time.

**Key implementation details (7 tasks):**
1. Data model and migration for `stripe_connect_account` table (`stripe_account_id`, `details_submitted`, `charges_enabled`)
2. `stripe-connect-account` Medusa module with service: `getOrCreateStripeAccount()`, `getAccountLink()`, `syncAccountStatus()`, `getConnectedAccountId()`
3. Admin API routes: GET `/admin/stripe-connect` (status), POST `/admin/stripe-connect/account-link` (onboarding URL)
4. Webhook route for `account.updated` at `/webhooks/stripe-connect`
5. Payment provider updated to resolve connected account from DB (remove `STRIPE_CONNECTED_ACCOUNT_ID` dependency); throws `MedusaError.NOT_ALLOWED` when Connect enabled but no account onboarded
6. Admin UI at `/app/stripe-connect` with four states: `not_connected`, `onboarding_incomplete`, `pending_verification`, `active`
7. Env cleanup: removed `STRIPE_CONNECTED_ACCOUNT_ID`; added `STRIPE_CONNECT_WEBHOOK_SECRET`, `MEDUSA_ADMIN_URL`

---

## Embedded Reference — Configurable Platform Fee AGENTS (Sibling Project)

> The following is the full AGENTS.md from the sibling project's completed configurable platform fee task, preserved here as implementation reference for porting. Note: "tickets" and "bento boxes" are sibling-project-specific product types; in this template the concept generalizes to events vs products.

- Owner: PabloJVelez
- Last Updated: 2026-03-07
- Status: Complete
- Task Hub: `.devagent/workspace/tasks/completed/2026-03-07_configurable-platform-fee-mode-tickets-bento/`

**Summary:** Introduces configuration to control how commission is accounted for per product type. In the sibling project: commission for chef event tickets is configurable as either a dollar amount per ticket or a percentage; for bento boxes (products), either a percentage or a set dollar amount. Behavior is config-driven via env vars. SKU prefix `EVENT-*` = event/ticket; everything else = product.

**Key implementation details (5 tasks):**
1. Verified payment context: provider uses `context.cart_id`/`resource_id` to resolve cart (Option A with fallback to percentage-of-total)
2. Env vars and provider config: `PLATFORM_FEE_MODE_TICKETS`/`PLATFORM_FEE_MODE_BENTO` (`per_unit` | `percent`), `PLATFORM_FEE_PER_TICKET_CENTS`, `PLATFORM_FEE_PER_BOX_CENTS`, `PLATFORM_FEE_PERCENT_TICKETS`/`PLATFORM_FEE_PERCENT_BENTO` (defaults to `PLATFORM_FEE_PERCENT`). Backward compatible.
3. Per-line fee calculation in `utils/platform-fee.ts`; `initiatePayment` uses `context.cart_id`/`resource_id` and `getCartLines`; fallback to percentage-of-total when no lines
4. `getCartLines` implemented via `cartModuleService.listLineItems`; payment module dependency on `cartModuleService` added in medusa-config
5. Unit tests for `isTicket`, `calculatePlatformFeeFromLines`; future-improvement note for product tag/attribute-based classification

---

## Embedded Reference — Configurable Platform Fee Implementation Plan (Sibling Project)

> The following is the implementation plan from the sibling project's configurable platform fee task, preserved here as reference. Same note: "tickets"/"bento" → generalize to events/products for this template.

- Owner: PabloJVelez
- Last Updated: 2026-03-07
- Related Task Hub: `.devagent/workspace/tasks/completed/2026-03-07_configurable-platform-fee-mode-tickets-bento/`

**Product context:** Platform commission was a single percentage of the cart (`PLATFORM_FEE_PERCENT`). This work introduced config-driven commission modes per product type, remaining compatible with Stripe Connect's single `application_fee_amount` per PaymentIntent by aggregating per-line fees into one total.

**Technical approach:** Provider receives `amount`, `currency_code`, and `context`. Chose Option A: use `context.resource_id` as cart_id, resolve cart → line items → variant SKU in provider; fallback to percentage-of-total when cart data unavailable.

**Implementation tasks:**
1. Verify payment context and choose strategy (Option A selected with fallback)
2. Add env vars and provider config shape (`PLATFORM_FEE_MODE_*`, `PLATFORM_FEE_PER_*_CENTS`, `PLATFORM_FEE_PERCENT_*`)
3. Implement per-line fee calculation (`calculatePlatformFeeFromLines`) and wire into `initiatePayment`
4. Resolve cart to line items via `cartModuleService.listLineItems` (Option A)
5. Tests, env docs, and future-improvement note (product tag/attribute for type classification)

**Key risks resolved:**
- Medusa core does pass resource_id in context → Option A viable
- Fallback to percentage-of-total when no line data ensures no regression
- `cartModuleService` dependency added to payment module in medusa-config
