# Stripe Connect Express + Direct Charges Migration — Clarification Packet

- Owner: PabloJVelez
- Date: 2026-04-05
- Task Hub: `.devagent/workspace/tasks/completed/2026-04-05_stripe-connect-express-direct-charges-migration/`
- Mode: Task Clarification
- Status: Complete

## Task Overview

Refactor the Stripe Connect integration from Custom accounts + destination charges to Express accounts + direct charges so that the chef is the merchant of record, eliminating the platform's cash-flow burden for Stripe fees, refunds, and chargebacks.

## Question Tracker

| # | Question | Answer | Status |
|---|----------|--------|--------|
| 1 | Connect billing model: "Stripe handles pricing" vs "You handle pricing" | A — "Stripe handles pricing." Platform earns via `application_fee_amount` and subscriptions. | ✅ answered |
| 2 | Existing Custom account migration path | No code needed. Manually delete Custom account from DB and Stripe to force fresh Express onboarding. | ✅ answered |
| 3 | Admin order widget: Stripe fee visibility | A — Simplify to show Platform Commission only. Stripe fees visible in chef's Express Dashboard. | ✅ answered |
| 4 | Preserve `USE_STRIPE_CONNECT` toggle? | B — Remove it. Template always uses Connect with Express + direct charges. Remove non-Connect code paths. | ✅ answered |
| 5 | Include `post-event-capture-ticket-payments` workflow in scope? | A — Yes, update all Stripe API call sites including that workflow. | ✅ answered |
| 6 | Verification approach | A — Manual testing in Stripe test mode (create Express account, onboard, make test payment, verify funds flow). | ✅ answered |
| 7 | Keep per-unit fee logic (events vs products)? | A — Keep as-is. Feeds into `application_fee_amount` the same way with direct charges. | ✅ answered |
| 8 | Admin widget: keep business name/email prefill for onboarding? | Simplify to "Connect with Stripe" button. Name/email not required for Express — Stripe collects during hosted onboarding. | ✅ answered |
| 9 | Add Express Dashboard link in admin widget? | A — Yes, add link when account is active using `stripe.accounts.createLoginLink()`. | ✅ answered |

## Clarified Requirements

### Connect Billing Model
- **Decision:** "Stripe handles pricing"
- **Implication:** No `PASS_STRIPE_FEE_TO_CHEF` needed (Stripe sets fees directly on connected account). No per-account or per-payout fees for the platform. Platform revenue = monthly subscription + `application_fee_amount`.
- **Config:** This is a Stripe Dashboard setting, not a code config. No env var needed.

### Existing Account Migration
- **Decision:** No automated migration flow. Manual process: delete the Custom account record from DB (`stripe_connect_account` table) and from Stripe, then re-onboard as Express.
- **Implication:** No dual-account-type support needed. No backward-compatible code paths for Custom accounts. Clean cutover: the code only creates Express accounts.
- **Implication for refunds on old orders:** Since the Custom account is deleted, refunds on historical destination-charge orders would need to be handled directly in Stripe Dashboard, not through the platform admin. This is acceptable since it's a one-time manual migration.

### Admin Order Widget
- **Decision:** Simplify to show Platform Commission (application fee) only. Remove estimated Stripe fee breakdown.
- **Implication:** Remove `pass_stripe_fee_to_chef`, `stripe_processing_fee_estimate` from payment data and admin widget. The `order-stripe-payout-breakdown.tsx` component shows: Order Total, Platform Commission, Chef Payout (= Total - Commission). Note in UI that Stripe processing fees are deducted from chef's account.

### USE_STRIPE_CONNECT Toggle
- **Decision:** Remove the toggle entirely. The template always uses Stripe Connect with Express accounts + direct charges.
- **Implication:** Remove the `USE_STRIPE_CONNECT` env var and all conditional code paths that check `isConnectEnabled()` / `useStripeConnect`. The provider always operates in Connect mode. This significantly simplifies the payment provider code — no branching between standard Stripe and Connect.
- **Implication:** The `StripeConnectProviderOptions.useStripeConnect` field and `StripeConnectConfig.useStripeConnect` field are removed. The `isConnectEnabled()` method is removed. All code that was behind `if (this.isConnectEnabled())` becomes the default path.

### Workflow Scope
- **Decision:** The `post-event-capture-ticket-payments` workflow is in scope. All Stripe API call sites across the codebase must be updated to include `{ stripeAccount }`.
- **Implication:** Need to audit `apps/medusa/src/workflows/post-event-capture-ticket-payments.ts` and any other file that calls Stripe APIs with PaymentIntent IDs.

### Verification
- **Decision:** Manual testing in Stripe test mode. No automated tests required for this task.
- **Approach:** Create Express test account → complete Stripe-hosted onboarding → make test payment → verify PaymentIntent on connected account → verify application fee on platform → verify refund debits connected account.

### Per-Unit Fee Logic
- **Decision:** Keep as-is. The per-unit fee calculation (events vs products by SKU, `PLATFORM_FEE_MODE_EVENTS`, `PLATFORM_FEE_PER_EVENT_CENTS`, etc.) is independent of charge type. It calculates `application_fee_amount`, which works identically with direct charges.
- **Implication:** `utils/platform-fee.ts`, `utils/get-fee-config.ts`, and related env vars/types are preserved unchanged.

### Admin Onboarding Widget
- **Decision:** Simplify the widget. Remove business name and email input fields. Just show a "Connect with Stripe" button that creates an Express account and redirects to Stripe-hosted onboarding.
- **Decision:** Add an "Express Dashboard" link (using `stripe.accounts.createLoginLink(accountId)`) when the account is active, so the chef/admin can access payout and fee visibility.
- **Implication:** The `not_connected` state in the widget becomes simpler — no form fields, just a button. The `active` state adds a Dashboard link. The API route for account-link creation simplifies (no business_name/email params needed, though they can still be passed as optional prefill).

### Scope Boundaries (Summary)
- **In scope:** Express account creation, direct charges (all API call sites), remove `USE_STRIPE_CONNECT` toggle, remove `PASS_STRIPE_FEE_TO_CHEF` + related env vars, update refund logic, update webhooks, update storefront `StripeElementsProvider`, update admin onboarding widget (simplify + Express Dashboard link), update admin order widget (commission only), update `post-event-capture-ticket-payments` workflow, update docs and env templates.
- **Out of scope:** Automated migration of existing Custom accounts (manual process), automated tests, "You handle pricing" support, destination charges fallback.

## Session Log

### Round 1 (2026-04-05)
- Q1: Connect billing model → A: "Stripe handles pricing"
- Q2: Existing account migration → Manual deletion, no code needed
- Q3: Admin widget Stripe fees → A: Simplify to commission only

### Round 2 (2026-04-05)
- Q4: USE_STRIPE_CONNECT toggle → B: Remove it, always use Connect
- Q5: post-event-capture workflow → A: Include in this task, update all call sites
- Q6: Verification → A: Manual testing in Stripe test mode

### Round 3 (2026-04-05)
- Q7: Per-unit fee logic → A: Keep as-is, works the same with direct charges
- Q8: Onboarding widget prefill → Simplify to "Connect with Stripe" button (name/email not required for Express)
- Q9: Express Dashboard link → A: Add it when account is active

## Assumptions Log

| Assumption | Owner | Validation Required | Validation Method |
|------------|-------|--------------------|--------------------|
| "Stripe handles pricing" can be configured self-serve in Stripe Dashboard | PabloJVelez | Yes | Check Stripe Dashboard Connect settings during implementation |
| `stripe.accounts.createLoginLink()` works for Express accounts in test mode | PabloJVelez | Yes | Manual test during implementation |
| Medusa's built-in webhook route can receive Connect webhook events (events on connected accounts) | PabloJVelez | Yes | Configure webhook in Stripe Dashboard with "Events on Connected accounts" and test |
| The `connected_account_id` stored in payment session data is available in all provider methods (`data` parameter) | PabloJVelez | Yes | Verify data flow during implementation |

## Gaps Requiring Research

None — all technical questions were resolved in the research phase (`research/2026-04-05_express-direct-charges-migration-research.md`).

## Plan Readiness Assessment

**Status: Ready for planning.**

All critical decisions are made:
- Billing model: "Stripe handles pricing"
- Account type: Express only (no toggle, no dual support)
- Charge type: Direct charges only (no destination fallback)
- Migration: Manual (no code)
- Admin UX: Simplified widget + Express Dashboard link + commission-only order view
- Scope: All Stripe API call sites including `post-event-capture-ticket-payments` workflow
- Verification: Manual testing in Stripe test mode
- Fee logic: Per-unit fee calculation preserved as-is

**Recommended next step:** `devagent create-plan`
