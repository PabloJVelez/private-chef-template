# Port Stripe Connect, Admin Onboarding, and Configurable Platform Fees — Plan

- Owner: PabloJVelez
- Last Updated: 2026-03-09
- Status: Draft
- Related Task Hub: `.devagent/workspace/tasks/active/2026-03-09_port-stripe-connect-and-admin-onboarding/`
- Stakeholders: PabloJVelez (Developer/Owner, Decision Maker)
- Notes: Ports three Stripe-related features from a sibling chef project into this template: Stripe Connect payment provider, admin onboarding, and configurable platform fee logic, generalized from tickets/bento to events vs products.

---

## PART 1: PRODUCT CONTEXT

### Summary
This plan describes how to port the sibling project’s Stripe Connect stack into this Medusa + Remix template so future chef projects start with a full Stripe Connect + onboarding + configurable platform fee setup. The work replaces the standard Stripe provider with a custom `stripe-connect` provider that can behave like standard Stripe (`USE_STRIPE_CONNECT=false`) or full Connect (`USE_STRIPE_CONNECT=true`), adds a DB-backed admin onboarding flow for the connected account, and introduces config-driven platform fee modes that differentiate events vs products (per-unit vs percentage) while remaining compatible with Stripe Connect’s single `application_fee_amount`. The implementation follows the proven sibling project design but adapts naming and configuration to this template’s more generic “events/products” model.

### Context & Problem
- **Current state:** This template uses the standard Stripe provider (`@medusajs/medusa/payment-stripe` with id `stripe`) configured via `STRIPE_API_KEY` in `apps/medusa/medusa-config.ts`. Storefront and seed scripts assume provider id `pp_stripe_stripe`. There is no Stripe Connect, no admin onboarding flow, and no configurable platform fee logic; platform commission is not modelled.
- **Sibling project:** A sibling chef project built on a similar stack implemented: (1) a custom Stripe Connect provider (`stripe-connect`) with application fees and destination charges, (2) a Stripe Connect account module plus admin APIs and webhook for onboarding, and (3) configurable platform fee modes that distinguish chef event tickets vs bento boxes using SKU prefix `EVENT-*`. That implementation is complete and has been field-tested.
- **Problem:** Without these capabilities, each new chef project must either re-implement Stripe Connect and onboarding from scratch or operate with a less flexible payment and fee model. Operators also lack UI-driven control over the connected account, and platform fee behavior is locked to a simple percentage of cart total.
- **Business trigger:** The template is meant to be the canonical starting point for new chef projects. Porting the proven Stripe Connect stack into the template significantly reduces time-to-first-transaction and ensures consistent, configurable fee behavior, while letting each chef project customize product types and fee modes without deep backend changes.

### Objectives & Success Metrics
- **Platform fee support:** Template supports Stripe Connect application fees with configurable fee modes per product type (events vs products), including per-unit and percentage options.  
- **Admin-managed onboarding:** Connected Stripe account can be created and onboarded via Medusa admin UI (no `STRIPE_CONNECTED_ACCOUNT_ID` env editing required).  
- **Template adoption:** New chef projects can enable Connect by setting env vars and completing onboarding, without needing structural code changes.  
- **Developer ergonomics:** Implementation aligns with Medusa v2 patterns and project TS/testing rules, minimizing friction when extending or debugging payments.

### Users & Insights
- **Template owner (developer):** Wants a reusable Stripe Connect stack that can be applied to multiple chef projects with minimal per-project customization. Values type safety, clear env/config surface, and predictable upgrade path.
- **Operators/admins (per-chef projects):** Need to onboard and maintain the connected Stripe account through admin, without env-file access. They need visible status (not connected, onboarding, pending verification, active) and straightforward actions (Connect, Complete Setup, Update Details).
- **End customers:** Continue to see a standard Stripe checkout; they should not be exposed to Connect concepts. Payment reliability and error handling must remain at least as good as current standard Stripe flows.

### Solution Principles
- **Single provider, dual modes:** Always use the custom `stripe-connect` provider; use `USE_STRIPE_CONNECT=false` to behave like standard Stripe and `USE_STRIPE_CONNECT=true` for full Connect, rather than wiring two separate providers.
- **Template-first naming:** Generalize sibling “tickets/bento” language to “events/products” while keeping the underlying mechanics (e.g., SKU prefix classification) straightforward and overrideable per chef project.
- **Medusa-native patterns:** Follow Medusa v2 conventions (modules, `MedusaService`, `AbstractPaymentProvider`, MikroORM migrations) and the project’s TypeScript/testing rules.
- **Config-driven behavior:** Expose all fee and Connect behavior via env/config, not code forks, so per-chef projects can tune percentages, per-unit fees, and Connect toggles safely.
- **Backward-compat not required:** Treat this as a breaking change for the template; no need to support in-place migration from prior template deployments beyond reseeding regions and updating env.

### Scope Definition
- **In Scope:**
  - Introducing a `stripe-connect` payment provider module in `apps/medusa`, wired via medusa-config and replacing `pp_stripe_stripe` usages in storefront and seed scripts with `pp_stripe-connect_stripe-connect`.
  - Adding a `stripe-connect-account` module (model, service, migration) and registering it in medusa-config.
  - Adding admin APIs (`/admin/stripe-connect`, `/admin/stripe-connect/account-link`) and a webhook route (`/webhooks/stripe-connect`) to manage and sync the connected account.
  - Adding a Medusa admin UI widget or page that surfaces Stripe Connect status and onboarding actions.
  - Porting and generalizing configurable platform fee logic (from tickets/bento to events/products) including env vars, helper util, and provider integration.
  - Updating `.env.template` and any relevant docs to expose new env surface.
- **Out of Scope / Future:**
  - Multi-vendor/multi-connected-account support.
  - Rich fee configuration/admin UI beyond env-based configuration.
  - Per-chef-specific UX copy or design; template will use neutral wording.

### Functional Narrative

#### Checkout & Payment (Standard vs Connect)
- **Trigger:** Customer checks out on a chef storefront built from this template and selects Stripe as payment method.
- **Experience narrative:**  
  - Storefront uses provider id `pp_stripe-connect_stripe-connect` for Stripe payments.  
  - Backend’s `stripe-connect` provider creates a PaymentIntent in Stripe, using standard Stripe fields when `USE_STRIPE_CONNECT=false`, and adding `application_fee_amount` + `transfer_data.destination` + `on_behalf_of` when `USE_STRIPE_CONNECT=true`.  
  - If fee-per-unit mode is disabled, application fee is a percentage of cart total. If enabled and cart id is available, the provider resolves cart lines, classifies them as events/products using SKU prefix, and calculates aggregated fee via the platform-fee util.  
  - Customer completes payment via Stripe Elements; success/failure is reported back to the storefront as today.
- **Acceptance criteria:**
  - With `USE_STRIPE_CONNECT=false`, PaymentIntents have no Connect fields and behave like standard Stripe.  
  - With `USE_STRIPE_CONNECT=true` and a connected account onboarded, PaymentIntents include `application_fee_amount` and `transfer_data.destination` for the configured connected account.  
  - In Connect mode, application fee matches configured fee rules for a representative cart (events-only, products-only, mixed).

### Experience References (Optional)
- Sibling project admin UX for Stripe Connect (status badges, CTAs) in `reference/admin-stripe-connect-snippets.md`.

### Technical Notes & Dependencies (Optional)
- **External dependencies:** Stripe API and webhooks; ensure test-mode keys & webhook endpoints are configured per env.
- **Medusa dependencies:** Payment module, cart module/service, admin framework, MikroORM migrations.
- **Env/deployment:** Template users must configure Stripe keys, webhook secrets, and admin URL (`MEDUSA_ADMIN_URL`) for Connect onboarding to work end-to-end.

---

## PART 2: IMPLEMENTATION PLAN

### Scope & Assumptions
- **Scope focus:** Backend Stripe payment architecture (Medusa), admin onboarding UX (Medusa admin), and fee logic; frontend Stripe Elements integration remains mostly unchanged aside from provider id.
- **Key assumptions:**
  - Sibling project reference code accurately represents the desired behavior and is safe to adapt with minimal structural changes.
  - Template will always use the custom `stripe-connect` provider, with `USE_STRIPE_CONNECT` toggling Connect behavior.
  - SKU prefix `EVENT-*` is an acceptable default for event-type products; template docs will explain how to override this per chef project.
- **Out of scope:** Multi-connected-account scenarios, extended fee governance, and cross-project migration tooling.

### Implementation Tasks

#### Task 1: Introduce `stripe-connect` payment provider and wire medusa-config
- **Objective:** Port the sibling project’s Stripe Connect provider into `apps/medusa`, wire it into the payment module via medusa-config, and ensure the template can switch between standard Stripe-like and Connect behavior via `USE_STRIPE_CONNECT`.
- **Impacted Modules/Files:**
  - `apps/medusa/src/modules/stripe-connect/types.ts` — new; adapted from `reference/provider/types.ts` with events/products naming decisions.
  - `apps/medusa/src/modules/stripe-connect/service.ts` — new; adapted from `reference/provider/service.ts`, preserving core behavior (initiate/update/capture/refund/cancel/retrieve/webhooks).
  - `apps/medusa/src/modules/stripe-connect/utils/get-smallest-unit.ts` — new; port from `reference/provider/utils/get-smallest-unit.ts`.
  - `apps/medusa/src/modules/stripe-connect/utils/get-fee-config.ts` — new; port from `reference/provider/utils/get-fee-config.ts` but rename envs from tickets/bento to events/products.
  - `apps/medusa/src/modules/stripe-connect/utils/platform-fee.ts` — new; port from `reference/provider/utils/platform-fee.ts`, updating names to events/products and documenting override strategy.
  - `apps/medusa/src/modules/stripe-connect/index.ts` — new module provider; adapted from `reference/provider/index.ts`.
  - `apps/medusa/medusa-config.ts` — update payment module config to use `resolve: './src/modules/stripe-connect'` and `id: 'stripe-connect'`, wiring env vars into `StripeConnectProviderOptions`.
- **References:**
  - Task AGENTS.md summary and checklist.
  - Clarification packet `clarification/2026-03-09_initial-clarification.md`.
  - Research packet `research/2026-03-09_stripe-connect-porting-research.md` (provider references).
  - `.cursor/rules/medusa-development.mdc`, `.cursor/rules/typescript-patterns.mdc`.
- **Dependencies:** None (first implementation step).
- **Acceptance Criteria:**
  - Medusa boots successfully with the new `stripe-connect` module registered.
  - `StripeConnectProviderService` is discoverable via the payment module (effective provider id `pp_stripe-connect_stripe-connect`).
  - With only `STRIPE_API_KEY` and `USE_STRIPE_CONNECT=false` set, payments behave like standard Stripe (no `application_fee_amount`, no `transfer_data`).
  - With `USE_STRIPE_CONNECT=true` and a connected account configured (hard-coded env for now), PaymentIntents have the expected Connect fields.
<!-- Note: Strictly avoid performance metrics (e.g., load times, response times) unless explicitly documented as a business requirement. Favor practical criteria (e.g., "component renders on mobile" rather than "loads in <500ms"). Follow project testing standards. -->
- **Testing Criteria:** <Specific testing instructions or validation steps>
- **Subtasks (optional):**
  1. `<Subtask title>` — Rationale / spec section
     - Validation: <Test hook or review gate following project testing standards>
  2. `<Subtask title>` — ...
- **Validation Plan:** <Tests, instrumentation, review gate following project testing standards>

#### Task 2: Add Stripe Connect account module, migration, and registration
- **Objective:** Port the Stripe Connect account module (model, service, migration) and register it so the payment provider and admin APIs can resolve account state from DB rather than env.
- **Impacted Modules/Files:**
  - `apps/medusa/src/modules/stripe-connect-account/models/stripe-account.ts` — new; adapted from `reference/connect-account/models/stripe-account.ts`.
  - `apps/medusa/src/modules/stripe-connect-account/service.ts` — new; port from `reference/connect-account/service.ts`.
  - `apps/medusa/src/modules/stripe-connect-account/index.ts` — new; port from `reference/connect-account/index.ts` (module registration).
  - `apps/medusa/src/migrations/<timestamp>_stripe_connect_account.ts` — new migration; adapted from `reference/connect-account/migrations/Migration20260303000000_stripe_connect_account.ts` to match this repo’s migration conventions.
  - `apps/medusa/medusa-config.ts` — register the `stripe-connect-account` module in the `modules` array with appropriate options (Stripe API key, admin URL).
- **References:** `reference/connect-account/*`, medusa migration patterns, clarification packet.
- **Dependencies:** Task 1 (medusa-config update patterns).
- **Acceptance Criteria:**
  - `medusa db:migrate` applies the new migration successfully, creating the `stripe_connect_account` table with appropriate unique constraints.
  - `stripeConnectAccountModuleService` (or equivalent token) is resolvable from the Medusa container.
  - Creating and retrieving a test Stripe Connect account via the service works in isolation (can be done via a small dev script).

### Implementation Guidance (Optional)

- **From `.cursor/rules/medusa-development.mdc` → Medusa v2 Architecture & Modules:**
  - Use `Module` and `MedusaService` for modules like `stripe-connect-account`, and `AbstractPaymentProvider` for payment providers. Follow the pattern where services are registered and resolved via container tokens (e.g. `stripeConnectAccountModuleService`).
- **From `.cursor/rules/typescript-patterns.mdc` → Type Safety & Error Handling:**
  - Prefer strict TypeScript types, avoid `any`, use discriminated unions where helpful, and use custom error types (`MedusaError`) to represent domain failures like missing connected accounts or invalid configuration.
- **From `.cursor/rules/testing-patterns-unit.mdc` and `testing-patterns-integration.mdc` → Testing patterns:**
  - Co-locate unit tests with modules/services and use integration tests for API endpoints and payment flows, focusing on behavior rather than implementation details.

### Release & Delivery Strategy (Optional)
- Single feature branch: Implement Tasks 1–5 on a single branch/PR, with incremental commits and clear testing notes.
- Testing milestones: After Tasks 1–3, run Stripe test-mode payments with Connect off/on and verify fees, transfers, and admin onboarding flows.
- Documentation: Ensure `.env.template` and any onboarding runbooks reflect the new Stripe Connect and fee configuration surface before merging.

---

## Risks & Open Questions

| Item | Type (Risk / Question) | Owner | Mitigation / Next Step | Due |
| --- | --- | --- | --- | --- |
| Differences between sibling project and template structure (paths, admin layout, migration setup) | Risk | PabloJVelez | During implementation, compare assumptions from reference with actual template structure; adjust imports, module tokens, and migration locations; update plan if structural divergences are significant. | Before merging |
| Default `EVENT-*` SKU prefix may not fit all chef projects | Question | PabloJVelez | Document classification strategy clearly in docs and provide guidance on how to change it; consider adding a config layer in a follow-up task if needed. | After initial rollout |

---

## Progress Tracking
Refer to the AGENTS.md file in the task directory for instructions on tracking and reporting progress during implementation.

---

## Appendices & References (Optional)
- **Task hub:** `.devagent/workspace/tasks/active/2026-03-09_port-stripe-connect-and-admin-onboarding/AGENTS.md`
- **Clarification:** `.devagent/workspace/tasks/active/2026-03-09_port-stripe-connect-and-admin-onboarding/clarification/2026-03-09_initial-clarification.md`
- **Research:** `.devagent/workspace/tasks/active/2026-03-09_port-stripe-connect-and-admin-onboarding/research/2026-03-09_stripe-connect-porting-research.md`
- **Provider reference:** `reference/provider/*`
- **Connect account reference:** `reference/connect-account/*`
- **Admin snippets:** `reference/admin-stripe-connect-snippets.md`
- **Cursor rules:** `.cursor/rules/medusa-development.mdc`, `.cursor/rules/typescript-patterns.mdc`, `.cursor/rules/testing-patterns-unit.mdc`, `.cursor/rules/testing-patterns-integration.mdc`
