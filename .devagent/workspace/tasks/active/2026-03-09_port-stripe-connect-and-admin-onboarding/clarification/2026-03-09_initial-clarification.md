# Clarified Requirement Packet — Port Stripe Connect, Admin Onboarding, and Configurable Platform Fees

- Requestor: PabloJVelez (Developer/Owner)
- Decision Maker: PabloJVelez (Developer/Owner)
- Date: 2026-03-09
- Mode: Task Clarification
- Status: In Progress
- Related Task Hub: `.devagent/workspace/tasks/active/2026-03-09_port-stripe-connect-and-admin-onboarding/`
- Notes: Clarifying how to port three Stripe-related features (Connect provider, admin onboarding, configurable platform fees) from a sibling chef project into this template repo, and how to generalize sibling-specific concepts like tickets/bento to events vs products.

## Task Overview

### Context
- **Task name/slug:** port-stripe-connect-and-admin-onboarding
- **Business context:** This parent template project should include the same Stripe Connect capabilities that were built and proven in a sibling chef project so future chef projects can start with a full Stripe Connect + onboarding + configurable-fee setup instead of re-implementing it each time.
- **Stakeholders:** PabloJVelez (Developer/Owner, Decision Maker)
- **Prior work:** Completed sibling-project task hubs for Stripe Connect, Stripe admin onboarding, and configurable platform fees (embedded in the task AGENTS.md for this task).

### Clarification Sessions
- Session 1: 2026-03-09 — Confirmed porting source approach, naming for fee modes, classification strategy for events vs products, implementation order, provider behavior, and upgrade expectations.

---

## Clarified Requirements

### Scope & End Goal

**What needs to be done?**
- Port the custom Stripe Connect payment provider from the sibling project into this template repo, replacing the standard Stripe provider (`@medusajs/medusa/payment-stripe` with id `stripe`) and wiring it through medusa-config, storefront, and seed scripts.
- Port the Stripe admin onboarding stack (DB model/module, admin API + webhook, admin UI, provider integration) so the connected account is configured through the Medusa admin instead of via `STRIPE_CONNECTED_ACCOUNT_ID`.
- Port and generalize the configurable platform fee logic so the template can support different platform-fee modes for events vs products (per-unit vs percentage) while remaining compatible with Stripe Connect’s single `application_fee_amount`.
- Generalize sibling-specific naming (tickets/bento, SKU conventions) to a template-friendly \"events vs products\" model and make it easy for each chef project to adapt.
- Implement the Stripe Connect provider and configurable-fee logic together as the first step, then layer on admin onboarding, with all three landing in a single branch/PR.

**What's the end goal architecture or state?**
- Medusa payment module uses a custom `stripe-connect` provider (effective id `pp_stripe-connect_stripe-connect`) configured from env (including Connect toggles and fee config). This provider always handles Stripe payments in the template; setting `USE_STRIPE_CONNECT=false` makes it behave like standard Stripe (no Connect), while `USE_STRIPE_CONNECT=true` enables full Connect behavior.
- A `stripe-connect-account` module persists the connected account and exposes methods to create/onboard/sync status and provide a connected account id for the provider.
- Admin has a `/app/stripe-connect` page that drives Stripe-hosted onboarding and reflects account status; backend has corresponding admin APIs and a Connect webhook route.
- Platform fee computation is centralized (likely in a `platform-fee` util used by the Stripe Connect provider) and can apply different modes/values per product type while exposing a single `application_fee_amount` to Stripe.

**In-scope (must-have):**
- Stripe Connect payment provider module, wired via medusa-config and replacing all `pp_stripe_stripe` usage with `pp_stripe-connect_stripe-connect` where appropriate.
- Stripe Connect admin onboarding (DB model, module/service, admin APIs, webhook, admin UI, env/docs).
- Configurable platform fee modes for at least two product types (events vs products), with per-unit and percentage options.
- Generalized naming and env vars (e.g. events/products) that avoid bento-specific semantics.

**Out-of-scope (won't-have):**
- Multi-vendor Connect (multiple connected accounts).
- Rich per-chef admin UX beyond what sibling project already provided (for this task we port and generalize, not redesign).
- End-customer-facing UX changes beyond what's required to keep checkout working with the new provider id.

**Nice-to-have (could be deferred):**
- Making product-type classification fully configurable (e.g. via tags or config maps) beyond a simple SKU-based strategy.
- Admin UI for configuring platform fee modes instead of env-only configuration.

---

## Clarification Session Log

### Session 1: 2026-03-09
**Participants:** PabloJVelez (Developer/Owner)

**Questions Asked & Answers:**
1. **Porting approach for implementation code (copy vs implement from docs)?**  
   → **Answer:** **A.** Provide the source files from the sibling project and adapt them for this template.

2. **Naming for configurable platform fee env vars and functions (tickets/bento vs generalized)?**  
   → **Answer:** **A.** Generalize to \"events\" and \"products\" (e.g. `PLATFORM_FEE_MODE_EVENTS`, `PLATFORM_FEE_MODE_PRODUCTS`, `PLATFORM_FEE_PER_EVENT_CENTS`, `PLATFORM_FEE_PER_PRODUCT_CENTS`, `isEvent()`).

3. **Classification strategy for line items (SKU prefix vs tags vs configurable strategy)?**  
   → **Answer:** **A.** Keep `EVENT-*` SKU prefix as the convention (treat as events), with everything else as products; per-chef projects can adjust if needed.

4. **Implementation order for the three features (provider, admin onboarding, configurable fees)?**  
   → **Answer:** **B.** Start with the provider and configurable-fee logic together, then add admin onboarding, all landing in a single branch/PR.

5. **Standard Stripe behavior in the template (which provider to use)?**  
   → **Answer:** **A.** Always use the custom `stripe-connect` provider and rely on `USE_STRIPE_CONNECT=false` to behave like standard Stripe (no Connect), and `USE_STRIPE_CONNECT=true` for full Connect.

6. **Backwards compatibility / upgrade path for existing template users on standard Stripe?**  
   → **Answer:** **C.** No special backwards-compatibility path is required; this can be treated as a breaking change for the template rather than an in-place upgrade for existing deployments.

**Ambiguities Surfaced:**
- None at this stage; remaining uncertainty is mostly about the exact list of sibling-project files to adapt and any small project-structure differences discovered during implementation.

**Unresolved Items:**
- Exact list of source files from the sibling project that will be provided for adaptation.

---

## Assumptions Log

| Assumption | Owner | Validation Required | Validation Method | Due Date | Status |
| --- | --- | --- | --- | --- | --- |
| Sibling project source files (provider, admin module, fee util, admin UI, APIs, webhook) will be available for copy/adaptation into this repo. | PabloJVelez | Yes | Provide and review file list before implementation | 2026-03-15 | Pending |
| Using `EVENT-*` SKU prefix as the default event classification is acceptable for the template, and per-chef projects can change it later if needed. | PabloJVelez | Yes | Revisit during plan/implementation; document override strategy in docs | 2026-03-15 | Pending |

