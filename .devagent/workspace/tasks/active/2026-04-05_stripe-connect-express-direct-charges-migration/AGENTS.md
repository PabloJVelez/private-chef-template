# Stripe Connect Express + Direct Charges Migration — Progress Tracker

- Owner: PabloJVelez
- Last Updated: 2026-04-05
- Status: Draft
- Task Hub: `.devagent/workspace/tasks/active/2026-04-05_stripe-connect-express-direct-charges-migration/`

## Summary

Refactor the Stripe Connect integration from Custom accounts + destination charges to Express accounts + direct charges so that the chef is the merchant of record. This eliminates the platform's cash-flow burden for Stripe fees, refunds, and chargebacks (which currently debit the platform balance under destination charges) and aligns with the "SaaS storefront builder" model that Stripe recommends for platforms like Shopify.

**Current state:** The platform creates connected accounts with `type: "custom"` and uses destination charges (`transfer_data.destination` + `application_fee_amount`). A `PASS_STRIPE_FEE_TO_CHEF` config grosses up the application fee to economically pass Stripe processing fees to the chef, but the platform balance is still debited for Stripe fees, refunds, and chargebacks. The refund logic does not set `reverse_transfer`, meaning refunds pressure the platform balance. This is documented in the existing task at `.devagent/workspace/tasks/active/2026-03-09_port-stripe-connect-and-admin-onboarding/`.

**Target state:** Connected accounts are created as `type: "express"` using Stripe-hosted onboarding with an Express Dashboard for chefs. Payments use direct charges — the PaymentIntent is created on the connected account (via the `Stripe-Account` header), with `application_fee_amount` for the platform's take. Under direct charges, Stripe fees, refunds, and chargebacks debit the connected (chef) account, not the platform. The `PASS_STRIPE_FEE_TO_CHEF` workaround and related config become unnecessary and are removed.

**Key migration constraints and decisions to resolve:**

1. **Account type is immutable:** Stripe does not allow changing an account's type after creation. Existing Custom accounts cannot be converted; the migration strategy must be "Express for new chefs" with a re-onboarding path for existing chefs (create new Express account).
2. **Charge type changes funds flow:** Direct charges create the PaymentIntent on the connected account. The platform collects revenue via `application_fee_amount`. Refunds/disputes debit the connected account.
3. **Reporting model changes:** Direct charges live on the connected account, not the platform. Platform reporting must use the `Stripe-Account` header or webhook events to maintain visibility.
4. **Connect billing model:** Evaluate "Stripe handles pricing" vs "You handle pricing" — the former eliminates per-account, per-payout, payout-volume, and tax-reporting fees for the platform.
5. **Onboarding UX:** Express accounts use Stripe-hosted onboarding and provide an Express Dashboard to chefs, reducing platform-side KYC/identity burden compared to Custom.
6. **Refund/dispute handling:** Under direct charges, refunds debit the connected account. The platform must decide its operational posture for supporting chefs through disputes.
7. **Statement descriptor:** Direct charges allow the chef's business info to appear on customer statements (vs the platform's info under destination charges).

**Scope of changes (anticipated):**

- **Onboarding module (`stripe-connect-account`):** Change account creation from `type: "custom"` to `type: "express"`. Update account link generation. Adjust status tracking for Express account states.
- **Payment provider (`stripe-connect`):** Switch from destination charges to direct charges. Create PaymentIntents on the connected account using `Stripe-Account` header. Remove `transfer_data.destination` and `on_behalf_of`. Keep `application_fee_amount` (works with direct charges). Remove `PASS_STRIPE_FEE_TO_CHEF` logic and related env vars (`STRIPE_FEE_FIXED`, `STRIPE_FEE_PERCENT`).
- **Webhook handling:** Update to handle webhooks from connected accounts (Stripe sends Connect webhooks to the platform for events on connected accounts). Adjust event routing.
- **Refund logic:** Refunds on direct charges are issued on the connected account. Update refund code to use `Stripe-Account` header. Remove `reverse_transfer` concerns (not applicable to direct charges). `refund_application_fee` still relevant for returning platform fee on refund.
- **Admin UI widget:** Update onboarding flow to reflect Express account states and Express Dashboard link.
- **Env vars and config:** Remove `PASS_STRIPE_FEE_TO_CHEF`, `STRIPE_FEE_FIXED`, `STRIPE_FEE_PERCENT`. Potentially add config for Connect billing model preference.
- **Documentation:** Update `docs/stripe-connect-and-fees.md` and onboarding runbook.
- **Storefront:** Verify and update any storefront payment flow that needs adjustment for direct charges (PaymentIntent creation scoped to connected account).

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
- [2026-04-05] Event: Task hub created for Stripe Connect Express + direct charges migration. Captures current state (Custom accounts + destination charges), target state (Express accounts + direct charges), migration constraints, and anticipated scope of changes across onboarding module, payment provider, webhooks, refund logic, admin UI, env config, docs, and storefront.
- [2026-04-05] Event: Research completed — comprehensive analysis of Express account creation, direct charges API (Stripe-Account header pattern), Stripe.js stripeAccount parameter, refund mechanics, webhook routing for Connect, and Connect billing models. Key finding: all current Stripe API calls need `{ stripeAccount }` option; `PASS_STRIPE_FEE_TO_CHEF` and fee gross-up logic can be removed entirely. See `research/2026-04-05_express-direct-charges-migration-research.md`.
- [2026-04-05] Event: Clarification completed — 9 questions resolved across 3 rounds. Key decisions: "Stripe handles pricing" billing model, remove `USE_STRIPE_CONNECT` toggle (always Connect), no automated migration (manual deletion), simplified admin widget with Express Dashboard link, commission-only order widget, all Stripe API call sites in scope including `post-event-capture-ticket-payments` workflow, manual testing. See `clarification/2026-04-05_initial-clarification.md`.
- [2026-04-05] Event: Implementation plan created — 7 tasks covering onboarding module (Express accounts), payment provider (direct charges + toggle/fee removal), medusa-config cleanup, storefront stripeAccount param, admin UI (simplified widget + commission-only breakdown), workflow audit, and docs/env update. See `plan/2026-04-05_express-direct-charges-migration-plan.md`.

## Implementation Checklist
- [x] Research: Document Stripe API differences (Custom+destination vs Express+direct), webhook behavior, refund mechanics, billing models.
- [x] Clarification: Resolve product/operational decisions for migration.
- [x] Plan: Create implementation plan with concrete tasks, files, and acceptance criteria.
- [ ] Task 1: Update onboarding module — Express accounts (`stripe-connect-account/service.ts`)
- [ ] Task 2: Refactor payment provider — direct charges + remove toggle + remove fee gross-up (`stripe-connect/service.ts`, `types.ts`, delete `estimate-stripe-processing-fee.ts`)
- [ ] Task 3: Update `medusa-config.ts` — remove deprecated options
- [ ] Task 4: Update storefront — `stripeAccount` in `loadStripe()` (`StripeElementsProvider.tsx`)
- [ ] Task 5: Update admin UI — onboarding widget + order payout breakdown
- [ ] Task 6: Audit `post-event-capture-ticket-payments` workflow
- [ ] Task 7: Update `.env.template` and `docs/stripe-connect-and-fees.md`

## Open Questions
*Resolved — see `clarification/2026-04-05_initial-clarification.md` for all decisions.*

## References
- [2026-04-05] `.devagent/workspace/tasks/active/2026-03-09_port-stripe-connect-and-admin-onboarding/AGENTS.md` — Prior task porting Stripe Connect (Custom + destination charges) from sibling project. Contains embedded references to sibling project implementation details.
- [2026-04-05] `docs/stripe-connect-and-fees.md` — Current documentation on Stripe Connect and fee handling in this template.
- [2026-04-05] `apps/medusa/src/admin/widgets/stripe-connect-store-widget.tsx` — Current admin onboarding UI widget for Stripe Connect.
- [2026-04-05] Stripe Docs: [Connect account types](https://docs.stripe.com/connect/account-types) — Comparison of Standard, Express, and Custom accounts.
- [2026-04-05] Stripe Docs: [Direct charges](https://docs.stripe.com/connect/charges#direct-charges) — Direct charges mechanics, funds flow, refund/dispute behavior.
- [2026-04-05] Stripe Docs: [Express accounts](https://docs.stripe.com/connect/express-accounts) — Express onboarding, Express Dashboard, platform responsibilities.
- [2026-04-05] Stripe Docs: [Connect pricing](https://docs.stripe.com/connect/pricing) — "Stripe handles pricing" vs "You handle pricing" billing models.
