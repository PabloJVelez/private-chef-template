# Stripe Connect Express + Direct Charges Migration Plan

- Owner: PabloJVelez
- Last Updated: 2026-04-05
- Status: Draft
- Related Task Hub: `.devagent/workspace/tasks/active/2026-04-05_stripe-connect-express-direct-charges-migration/`
- Stakeholders: PabloJVelez (Owner, Decision Maker)

---

## PART 1: PRODUCT CONTEXT

### Summary

Migrate the Stripe Connect integration from Custom accounts with destination charges to Express accounts with direct charges. This makes the chef the merchant of record, moves Stripe fees/refunds/chargebacks off the platform's balance, eliminates the `PASS_STRIPE_FEE_TO_CHEF` workaround, removes the `USE_STRIPE_CONNECT` toggle (always Connect), and simplifies the admin UX. The platform adopts "Stripe handles pricing" Connect billing to eliminate per-account and per-payout fees.

### Context & Problem

The current implementation uses Custom accounts and destination charges. This creates several problems:
- **Platform cash-flow risk:** Stripe fees, refunds, and chargebacks debit the platform's balance, not the chef's.
- **Workaround complexity:** `PASS_STRIPE_FEE_TO_CHEF` grosses up the application fee to economically pass Stripe processing fees to the chef, but the platform balance is still debited.
- **Refund risk:** The refund code doesn't set `reverse_transfer`, meaning refunds pressure the platform balance.
- **Toggle complexity:** `USE_STRIPE_CONNECT` creates dual code paths (standard Stripe vs Connect) that increase maintenance burden.

See: `research/2026-04-05_express-direct-charges-migration-research.md`, `clarification/2026-04-05_initial-clarification.md`

### Objectives & Success Metrics

1. All new connected accounts are created as Express (not Custom).
2. All payments use direct charges (PaymentIntent created on connected account via `Stripe-Account` header).
3. Stripe fees, refunds, and chargebacks debit the connected account, not the platform.
4. `PASS_STRIPE_FEE_TO_CHEF` and related config/code are removed.
5. `USE_STRIPE_CONNECT` toggle is removed — always Connect mode.
6. Admin onboarding widget simplified; Express Dashboard link added.
7. Admin order widget shows commission only (no estimated Stripe fees).

### Solution Principles

- **Clean cutover:** No dual-mode support. The template always uses Express + direct charges.
- **Preserve fee logic:** Per-unit fee calculation (events vs products) is preserved unchanged — it feeds `application_fee_amount` which works identically with direct charges.
- **Simplify, don't rewrite:** Minimal changes to the payment provider structure. The main change is adding `{ stripeAccount }` to Stripe API calls and removing destination-charge-specific code.

### Scope Definition

**In Scope:**
- Express account creation (replace `type: "custom"` with `type: "express"`)
- Direct charges (all Stripe API calls with `{ stripeAccount }`)
- Remove `USE_STRIPE_CONNECT` toggle and non-Connect code paths
- Remove `PASS_STRIPE_FEE_TO_CHEF` and fee gross-up logic
- Update storefront `StripeElementsProvider` with `stripeAccount` param
- Update admin onboarding widget (simplify, add Express Dashboard link)
- Update admin order payout breakdown (commission only)
- Update `post-event-capture-ticket-payments` workflow
- Update docs and env templates
- Update `medusa-config.ts`

**Out of Scope / Future:**
- Automated migration of existing Custom accounts (manual process)
- Automated tests
- "You handle pricing" Connect billing support
- Destination charges fallback

---

## PART 2: IMPLEMENTATION PLAN

### Scope & Assumptions

- **Scope:** Full migration across onboarding module, payment provider, admin UI, storefront, workflows, config, and docs.
- **Key assumptions:**
  - "Stripe handles pricing" can be configured self-serve in Stripe Dashboard.
  - `stripe.accounts.createLoginLink()` works for Express accounts in test mode.
  - Medusa's built-in webhook route can receive Connect webhook events.
  - `connected_account_id` in payment session data is available in all provider method `data` parameters.
- **Out of scope:** Existing Custom account migration code, automated tests, destination charges fallback.

### Implementation Tasks

#### Task 1: Update onboarding module — Express accounts

- **Objective:** Change connected account creation from Custom to Express. Simplify `getOrCreateStripeAccount` since business name/email are optional prefill only. Add Express Dashboard login link generation.
- **Impacted Modules/Files:**
  - `apps/medusa/src/modules/stripe-connect-account/service.ts`
- **References:** [Stripe Express accounts docs](https://docs.stripe.com/connect/express-accounts), research finding #1
- **Dependencies:** None
- **Acceptance Criteria:**
  - `getOrCreateStripeAccount()` creates accounts with `type: "express"` instead of `type: "custom"`
  - New method `createExpressDashboardLink(stripeAccountId)` returns a login link URL using `stripe.accounts.createLoginLink()`
  - `business_name` and `email` params remain optional (prefill only)
- **Subtasks:**
  1. `Change type: "custom" to type: "express"` — Line 69 in service.ts. Change `accountParams.type` from `"custom"` to `"express"`.
  2. `Add createExpressDashboardLink method` — New method that calls `stripe.accounts.createLoginLink(stripeAccountId)` and returns `{ url: string }`.
- **Validation Plan:** Manual test: create Express account in Stripe test mode, verify account object has `type: "express"`.

#### Task 2: Refactor payment provider — direct charges + remove toggle

- **Objective:** Switch all Stripe API calls from platform-level (destination charges) to connected-account-level (direct charges). Remove `USE_STRIPE_CONNECT` toggle and all non-Connect code paths. Remove `PASS_STRIPE_FEE_TO_CHEF` and fee gross-up logic.
- **Impacted Modules/Files:**
  - `apps/medusa/src/modules/stripe-connect/service.ts`
  - `apps/medusa/src/modules/stripe-connect/types.ts`
  - `apps/medusa/src/modules/stripe-connect/utils/estimate-stripe-processing-fee.ts` (delete)
- **References:** [Stripe direct charges docs](https://docs.stripe.com/connect/direct-charges), research findings #2–5, #8
- **Dependencies:** None (can be done in parallel with Task 1)
- **Acceptance Criteria:**
  - `initiatePayment`: creates PaymentIntent with `stripe_.paymentIntents.create(params, { stripeAccount: connectedAccountId })`. No `transfer_data`, no `on_behalf_of`.
  - `authorizePayment`, `capturePayment`, `retrievePayment`, `getPaymentStatus`, `updatePayment`, `cancelPayment`, `deletePayment`: all Stripe API calls include `{ stripeAccount }` extracted from `data.connected_account_id`.
  - `refundPayment`: `stripe_.refunds.create(params, { stripeAccount })`.
  - `isConnectEnabled()` method removed — always Connect mode.
  - `useStripeConnect` field removed from options, config, and types.
  - `passStripeFeeToChef`, `stripeFeePercent`, `stripeFeeFlatCents` removed from options, config, and types.
  - `estimateStripeProcessingFee` util file deleted.
  - `payoutAdminFieldsForAmount()` method removed.
  - `persistDataFromPaymentIntent()` simplified — store `application_fee_amount` directly, no `transfer_data.destination` parsing.
  - `pass_stripe_fee_to_chef` and `stripe_processing_fee_estimate` removed from `StripeConnectPaymentData`.
  - `calculateApplicationFee` method simplified — no Stripe fee gross-up branch.
  - `connectedAccountId` config field removed (legacy env-based fallback). Account always resolved from DB via `stripeConnectAccountModuleService`.
- **Subtasks:**
  1. `Remove USE_STRIPE_CONNECT toggle` — Remove `isConnectEnabled()`, `useStripeConnect` from config/types/options. Remove all `if (this.isConnectEnabled())` conditionals — the enclosed code becomes the default path. Remove `connectedAccountId` from config (env-based fallback).
  2. `Remove PASS_STRIPE_FEE_TO_CHEF logic` — Remove `passStripeFeeToChef`, `stripeFeePercent`, `stripeFeeFlatCents` from types/config/options. Remove `calculateApplicationFee` gross-up branch. Remove `payoutAdminFieldsForAmount()`. Remove `estimateStripeProcessingFee` import and util file. Remove `pass_stripe_fee_to_chef`, `stripe_processing_fee_estimate` from `StripeConnectPaymentData`.
  3. `Add { stripeAccount } to all Stripe API calls` — Helper method `private getStripeAccountFromData(data?: Record<string, unknown>): string | undefined` to extract `connected_account_id` from payment data. Update every Stripe API call in every method.
  4. `Switch initiatePayment to direct charges` — Remove `on_behalf_of`, `transfer_data.destination`. Add `{ stripeAccount: connectedAccountId }` to `paymentIntents.create()`. Keep `application_fee_amount`.
  5. `Simplify persistDataFromPaymentIntent` — No more `transfer_data.destination` parsing. Store `application_fee_amount` from the PaymentIntent directly.
- **Validation Plan:** Manual test: create payment in Stripe test mode, verify PaymentIntent exists on connected account (not platform), verify application fee appears on platform.

#### Task 3: Update medusa-config.ts — remove deprecated options

- **Objective:** Clean up `medusa-config.ts` to remove deprecated env vars and provider options.
- **Impacted Modules/Files:**
  - `apps/medusa/medusa-config.ts`
- **References:** Clarification Q4 (remove toggle)
- **Dependencies:** Task 2 (types must be updated first)
- **Acceptance Criteria:**
  - `USE_STRIPE_CONNECT` env var parsing and provider option removed
  - `PASS_STRIPE_FEE_TO_CHEF` env var parsing and provider option removed
  - `STRIPE_FEE_PERCENT` env var parsing and provider option removed
  - `STRIPE_FEE_FLAT_CENTS` env var parsing and provider option removed
  - Provider options simplified to: `apiKey`, `refundApplicationFee`, `webhookSecret`
- **Subtasks:**
  1. `Remove deprecated env var parsing` — Lines 13–24: remove `USE_STRIPE_CONNECT`, `PASS_STRIPE_FEE_TO_CHEF`, `STRIPE_FEE_PERCENT`, `STRIPE_FEE_FLAT_CENTS`.
  2. `Simplify provider options` — Lines 169–177: remove `useStripeConnect`, `passStripeFeeToChef`, `stripeFeePercent`, `stripeFeeFlatCents`.
- **Validation Plan:** App starts without errors after config cleanup.

#### Task 4: Update storefront — `stripeAccount` in Stripe.js

- **Objective:** Pass `stripeAccount` to `loadStripe()` so Stripe Elements operate on the connected account for direct charges.
- **Impacted Modules/Files:**
  - `apps/storefront/app/components/checkout/StripePayment/StripeElementsProvider.tsx`
- **References:** Research finding #4, #10
- **Dependencies:** Task 2 (payment provider must store `connected_account_id` in payment data)
- **Acceptance Criteria:**
  - `loadStripe` called with `{ stripeAccount: connectedAccountId }` where `connectedAccountId` is read from the payment session data (`data.connected_account_id`)
  - Elements initialize with `client_secret` from the PaymentIntent on the connected account
  - Payment confirmation works end-to-end in Stripe test mode
- **Subtasks:**
  1. `Extract connected_account_id from payment session` — Read from `stripeSession.data.connected_account_id`.
  2. `Pass stripeAccount to loadStripe` — `loadStripe(env.STRIPE_PUBLIC_KEY, { stripeAccount: connectedAccountId })`. Update `useMemo` deps to include `connectedAccountId`.
- **Validation Plan:** Manual test: complete checkout in storefront test mode, verify payment confirmation succeeds on connected account.

#### Task 5: Update admin UI — onboarding widget + order payout breakdown

- **Objective:** Simplify the onboarding widget (remove form fields, add Express Dashboard link). Simplify the order payout breakdown (commission only, no Stripe fee estimate).
- **Impacted Modules/Files:**
  - `apps/medusa/src/admin/widgets/stripe-connect-store-widget.tsx`
  - `apps/medusa/src/admin/components/order-stripe-payout-breakdown.tsx`
  - `apps/medusa/src/lib/order-stripe-payout.ts`
  - `apps/medusa/src/admin/hooks/stripe-connect.ts`
  - `apps/medusa/src/api/admin/stripe-connect/route.ts`
  - `apps/medusa/src/api/admin/stripe-connect/account-link/route.ts`
  - `apps/medusa/src/sdk/admin/admin-stripe-connect.ts`
- **References:** Clarification Q3 (commission only), Q8 (simplify widget), Q9 (Express Dashboard link)
- **Dependencies:** Task 1 (Express Dashboard link method), Task 2 (payment data shape changes)
- **Acceptance Criteria:**
  - **Onboarding widget:**
    - `not_connected` state: no business name/email form fields, just a "Connect with Stripe" button
    - `active` state: shows "Express Dashboard" button/link that opens the chef's Express Dashboard
    - API route/SDK supports creating Express Dashboard login links
  - **Order payout breakdown:**
    - Shows: Charged to customer, Platform commission, Chef take-home (= Charged − Commission)
    - No "Stripe processing fees" row
    - No `pass_stripe_fee_to_chef` or `stripe_processing_fee_estimate` logic
  - **Admin API:**
    - GET `/admin/stripe-connect` returns `express_dashboard_url` when account is active (or new endpoint)
    - POST `/admin/stripe-connect/account-link` no longer requires `business_name`/`email` (still accepted as optional prefill)
- **Subtasks:**
  1. `Add Express Dashboard link to admin API` — New GET endpoint or extend existing GET to include `express_login_url` field when account is active. Calls `svc.createExpressDashboardLink()` from Task 1.
  2. `Simplify onboarding widget` — Remove `businessName`/`email` state, Input fields, and Label components from `not_connected` state. Add Express Dashboard button in `active` state.
  3. `Simplify order payout breakdown` — Remove `passStripeFeeToChef` and `stripeProcessingEstimateSmallest` from `extractPlatformCommission()`. Remove "Stripe processing fees" row from the component. Simplify `platformNetSmallest` calculation (just = `feeSmallest`). Update "Chef take-home" to = Charged − Commission.
  4. `Update SDK types` — Remove `business_name`/`email` from required params in `StripeConnectAccountLinkBody` (keep optional). Add Express Dashboard URL to status response type.
- **Validation Plan:** Manual test: verify onboarding flow with simplified widget, verify Express Dashboard link opens, verify order payout breakdown shows commission only.

### Task 6: Update post-event-capture workflow

- **Objective:** Ensure the `post-event-capture-ticket-payments` workflow works with direct charges. Since this workflow uses Medusa's `capturePaymentWorkflow` (which delegates to the payment provider), it should work without direct changes if the provider handles `{ stripeAccount }` correctly.
- **Impacted Modules/Files:**
  - `apps/medusa/src/workflows/post-event-capture-ticket-payments.ts`
- **References:** Clarification Q5 (include in scope)
- **Dependencies:** Task 2 (payment provider must handle `stripeAccount` in capture)
- **Acceptance Criteria:**
  - Workflow correctly captures payments that are direct charges on connected accounts
  - No direct Stripe API calls in this file need updating (it delegates to `capturePaymentWorkflow`)
- **Subtasks:**
  1. `Audit workflow for direct Stripe API calls` — Review the file. If it only uses `capturePaymentWorkflow` (which delegates to the provider), no changes needed. If it makes direct Stripe SDK calls, add `{ stripeAccount }`.
- **Validation Plan:** Code review confirms workflow delegates to Medusa's capture flow which uses the provider.

#### Task 7: Update env templates and documentation

- **Objective:** Update `.env.template` and `docs/stripe-connect-and-fees.md` to reflect Express + direct charges model.
- **Impacted Modules/Files:**
  - `apps/medusa/.env.template`
  - `docs/stripe-connect-and-fees.md`
- **References:** Research, clarification decisions
- **Dependencies:** Tasks 1–5 (all code changes complete)
- **Acceptance Criteria:**
  - `.env.template`: removed `USE_STRIPE_CONNECT`, `PASS_STRIPE_FEE_TO_CHEF`, `STRIPE_FEE_PERCENT`, `STRIPE_FEE_FLAT_CENTS` and their comments. Comments updated to say "Express account" and "direct charges".
  - `docs/stripe-connect-and-fees.md`: updated to describe Express accounts, direct charges, simplified onboarding, Express Dashboard, "Stripe handles pricing", commission-only admin view. Webhook section updated to note Connect endpoint requirement.
- **Subtasks:**
  1. `Update .env.template` — Remove 4 deprecated vars and comments. Update `USE_STRIPE_CONNECT` comment to note direct charges.
  2. `Rewrite docs/stripe-connect-and-fees.md` — Update all sections for Express + direct charges model.
- **Validation Plan:** Read-through confirms docs match new implementation.

### Implementation Guidance

- **From `.cursor/rules/medusa-development.mdc` → Module Development:**
  - Services extend `MedusaService` for auto-generated CRUD. The `StripeConnectAccountModuleService` already follows this pattern — the new `createExpressDashboardLink` method is added as a custom method alongside the generated ones.

- **From `.cursor/rules/medusa-development.mdc` → API Route Patterns:**
  - Admin routes follow `MedusaRequest`/`MedusaResponse` pattern with service resolution via `req.scope.resolve()`. The Express Dashboard link endpoint follows this existing pattern.

- **From `.cursor/rules/remix-storefront-components.mdc` → Component Patterns:**
  - Storefront components use `useMemo` for expensive computations. The `stripePromise` in `StripeElementsProvider` already uses `useMemo` — update its dependency array to include `connectedAccountId`.

- **From `.cursor/rules/typescript-patterns.mdc` → Error Handling:**
  - Use `MedusaError` types for payment provider errors. The existing error handling pattern in the payment provider is preserved.

---

## Risks & Open Questions

| Item | Type | Owner | Mitigation / Next Step | Due |
| --- | --- | --- | --- | --- |
| Webhook must be registered as Connect endpoint in Stripe Dashboard | Risk | PabloJVelez | Document in docs; verify during manual testing that "Events on Connected accounts" is selected | During testing |
| `connected_account_id` availability in all provider methods' `data` param | Risk | PabloJVelez | Verify during Task 2 implementation; Medusa passes the full payment data object to each provider method | Task 2 |
| Express Dashboard login links may expire quickly | Risk | PabloJVelez | Stripe login links are single-use; generate on-demand when admin clicks the button (don't cache) | Task 5 |
| "Stripe handles pricing" Dashboard configuration | Question | PabloJVelez | Verify self-serve in Stripe Dashboard Connect settings during setup | Before testing |
| Historical orders with destination charges | Risk | PabloJVelez | Accepted: refunds on old orders handled directly in Stripe Dashboard, not through platform admin (one-time manual migration) | N/A |

---

## Progress Tracking

Refer to the AGENTS.md file in the task directory for instructions on tracking and reporting progress during implementation.

---

## Appendices & References

- **Research:** `research/2026-04-05_express-direct-charges-migration-research.md`
- **Clarification:** `clarification/2026-04-05_initial-clarification.md`
- **Task hub:** `.devagent/workspace/tasks/active/2026-04-05_stripe-connect-express-direct-charges-migration/AGENTS.md`
- **Prior task:** `.devagent/workspace/tasks/active/2026-03-09_port-stripe-connect-and-admin-onboarding/AGENTS.md`
- **Stripe docs:** [Direct charges](https://docs.stripe.com/connect/direct-charges), [Express accounts](https://docs.stripe.com/connect/express-accounts), [Connect pricing](https://stripe.com/us/connect/pricing), [Connect webhooks](https://docs.stripe.com/connect/webhooks)
- **Coding standards:** `.cursor/rules/medusa-development.mdc`, `.cursor/rules/typescript-patterns.mdc`, `.cursor/rules/remix-storefront-components.mdc`
