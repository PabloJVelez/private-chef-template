# Final-stack requirements-to-tests matrix

Authority: [full contract v1.1/r4](requirements-v1.1-r4.md). R/T identifiers are the traceability labels in the [reconciled architecture](reconciled-architecture.md), not new requirements. A passing foundation test does **not** pass its policy-dependent release acceptance. Exact execution totals and head SHA belong in the PR evidence. Paths below are relative to `apps/medusa` unless specified.

Test shorthand:

- **F**: `integration-tests/http/meal-prep-foundations.spec.ts` (imports capture, approval, billing, autopay and fulfillment suites into one real Medusa/PostgreSQL realm).
- **C/A/B/P/X**: `integration-tests/http/meal-prep-{capture,approvals,billing,autopay,fulfillment}.suite.ts`, respectively, executed through F.
- **S**: `integration-tests/http/shared-scheduling.spec.ts`; **V**: `availability-{concurrency,save,setup-migration}.spec.ts` in that directory.
- **U**: complete `src/**/__tests__/*.unit.spec.*` suites, including meal-prep recurrence/capture/provider contracts, Availability query/rendered setup, and existing private-event provider tests. **SU**: storefront unit/rendered suites.
- **M**: `scripts/verify-meal-prep/migrations.cjs` from repository root; **L**: `integration-tests/availability/legacy-migration.spec.ts`.

| Requirement | Tests / executed foundation boundary | Unresolved release acceptance |
| --- | --- | --- |
| R01 Authority | T01: full contract and recovered architecture/plan; U frozen false flags; X rejects production runtime/policy fields; provenance in PR docs | Human review and successor contract for decisions |
| R02 Three methods | T02: C conditional method intake; U independent Availability enablement; X **3 methods × 4 recurrence patterns** through menu approval, explicit work, plan and method completion | D02/D03 customer windows, location and delivery eligibility; execution UX |
| R03 Four selection styles | T03: C/U individual/package/chosen-menu/tailored capture, immutable references, unknown price; B exact-price gate | D04/D05 package/tailored pricing and customer UX |
| R04 Date eligibility/servings | T03/T05: C expired/stale offers, relevant week/date, servings; A revalidates on approval; X approved serving summaries | No billing-unit semantics inferred from quantities/servings |
| R05 Shared prices/separate fees | T03/T08: common dated offer base-price references across methods; C no method pricing input; B component sum, exact approved quote, currency/provider conversion; X never changes quote/payment | D03/D04/D11 fee/price classification; free eligible in-area delivery requires D02 eligibility |
| R06 Groceries/terms | T08/T14: B rejects unknown/unapproved values, explicit test-only components and provenance; no default formula | D05 supported configurations/true-ups/deposits/payment terms |
| R07 Delivery area | T02/T14: U radius and ZIP draft validation/roundtrip; C delivery intake; X no fee/area calculation | D02 combination/address/out-of-area behavior; no paid out-of-area path |
| R08 Manual capacity | T04: S shared work links; X multiple pickup/delivery orders share **one** reservation, advisory order/serving report; no count rejection in commands | Owner validates planning UX once enabled; summaries are only explicitly queried IDs |
| R09 Availability/actual time | T04/T06/T07: S/V real cross-domain races, overlapping/adjacent intervals, direct writers, linked block guards, settings races/global hours; U/SU rendered Availability regression; X no automatic reservations, drift read | D03 method scheduling and D12 external assurance; Google remains advisory |
| R10 Four recurrence patterns | T05: U weekly/fortnightly/year-boundary/multiple/custom, stable identity, explicit bounds, DST gap/fold; A candidate retries; X all four patterns across each method | D09 horizon/end/replenishment/partial conflicts and production materialization |
| R11 Separate approvals | T05/T08: A arrangement vs each menu, rejection, ownership; B exact approved menu quote; X unapproved menu cannot plan | Customer/admin approval UI and resolved pricing policies |
| R12 Approved changes only | T05/T06/T08: A pending portions/menu preserve confirmed data, chef-only application, rejection; skip/pause/reschedule application gated; S atomic replacement preserves old reservation on conflict; X stale plan after approved changes | D06/D07/D09 applying commercial transitions; started-fulfillment corrections need reviewed command |
| R13 Missed selections | T05/T10: A initial-submission deadline and follow-up without repeat/substitute/cancel; X manual resolution cannot clear the source flag | Real chef/customer notifications/access |
| R14 Conditional intake | T02/T11: C all-method general data, method-specific fields, stale/cross-household/chef rejection; X exact approved intake reference, reference-only report | D03 final location/window validation and D10 customer entry/access |
| R15 Per-occurrence/autopay | T08/T09: B/P exact approved amount, explicit customer consent, setup≠consent, opt-out, account scope, concurrent manual/autopay exclusion, replay, unknown timeout/recovery | D01/D04/D05/D10/D11; native Medusa paid collection reconciliation; sandbox E2E |
| R16 Payment links/reminders | T09/T10: B immediate durable notification intent; P explicit fixture trigger, paid-before-send suppression, lease recovery and receiver dedupe mock | D01 timing; D10 authenticated link delivery; production email transport/dedupe |
| R17 Payment failure | T09/T10: P decline/authentication and definitive pre-create rejection preserve scheduling/menu, fallback/manual link, follow-up; X operations report separates failed payment from fulfillment | Real link delivery and D08 unpaid-service policy; no automatic cancellation |
| R18 Safety/privacy | T08/T09/T11: B/P signed raw webhook bytes, account/amount/quote mismatch, replay, invalid saved method, revocation/concurrency; C/A ownership before private reads; X chef-only reports/receipt authorization, no private intake in logs/outbox/report | D10 selected credential expiry/revocation UX and full security review |
| R19 Event compatibility | T07/T12/T13: S/V/L existing acceptance/reservation/legacy protections; U existing private-event Stripe amount/account/fee/manual-capture/replay; all SU/U rerun; M fresh/upgrade parent hashes | Complete real checkout/ticket inventory/additional charges/fulfillment/email/receipt E2E; production-scale migration |
| R20 Policy gates | T01/T14: all false controls, explicit fixture provenance, unknown-field rejection, no auto capacity/spending caps; every D gate remains listed | **T14 unresolved**: no D01–D12 product decision has been adopted; full V1 release acceptance cannot pass yet |

Additional PR8 integrity tests (T11/T13): concurrent duplicate commands and stale chefs, cross-owner reads and receipt replay, exact same-occurrence follow-up resolution, wrong-method transition rejection, immutable history, final-write rollback of version/event/audit/outbox, populated rollback refusal. M validates empty PR8 downgrade/reapply while retaining populated PR6/PR7 data.

The complete harness fails for skipped/empty/todo/error suites. Focused owner walkthrough commands intentionally select subsets and are not substitutes for the comprehensive no-skip run. Real PostgreSQL tests are required; tests skipped because a database URL is absent provide no concurrency evidence. Provider transport mocks never initiate real network charges or emails.
