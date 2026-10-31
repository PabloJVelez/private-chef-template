# Meal Prep V1 PR 8 — Fulfillment foundations and final-stack validation

Authority: the **full [Requirements Contract v1.1, artifact revision 4](requirements-v1.1-r4.md)**, [reconciled BTS-3 architecture](reconciled-architecture.md), and [stacked delivery plan](stacked-delivery-plan.md). The latter two were recovered in full from the prior T3 handoff before editing; their historical statements are not current execution evidence. Assigned BTS-7 objective: method-specific fulfillment foundations, chef follow-up, status/operational visibility, integration/regression coverage, migration rehearsal and repeatable final-tip owner testing. BTS-3 receives the architecture/validation limitations through ChatGPT.

## Verified stack and scope

Origin was verified as `git@github.com:PabloJVelez/private-chef-template.git`. The bound worktree was clean on `feat/meal-prep-v1-fulfillment-validation`. HEAD, merge-base, remote parent branch and open PR #27 all matched **`f4557fab9d75b515611645be44bbabeb0bda1b10`** before edits. PR8 targets `feat/meal-prep-v1-autopay-reminders`. No upstream branch is changed. The final PR handoff supplies head SHA and CI URLs.

The session read the complete contract and architecture and stated requirements, policy conflicts, tests and migration scope before edits. R02/R08/R09/R11–R14/R17–R20 apply directly; the final matrix covers R01–R20 and T01–T14 across the stack. The original PR8 proposal's complete execution UX and approved unpaid/cancellation behavior cannot be activated without D01–D12 decisions. The user explicitly scoped this layer to disabled foundations. This is a release gate, not a reduction of V1's three-method/four-pattern acceptance requirements.

## Fulfillment and operations

`executeTestFulfillmentCommand` accepts chef-only strict commands, checks current household ownership before receipt replay, takes the same occurrence lock as approval/billing, checks the aggregate version, and atomically appends an event, audit, outbox and idempotency receipt. Duplicate keys replay; different payloads conflict. Any final-write failure rolls back everything. References in audit/outbox contain no intake, address, home-access, provider URL or card details.

A plan freezes the approved menu, resolved candidate, explicitly linked work IDs, method, and test policy provenance. In-home and delivery plans reference the exact intake revision in the approved selection; pickup uses an explicit fixture location reference, without selecting a real pickup-location policy. It does not calculate windows, delivery eligibility or fees. Initial menu approval is mandatory, including when the quote is unknown; a fulfillment plan does not approve or collect money.

The test fixture transitions are:

- In-home: planned → in progress → completed.
- Delivery: planned → preparing → ready → dispatched → delivered.
- Pickup: planned → preparing → ready → collected.

These are separate operational observations, not production policy or authorization to serve an unpaid booking. Progress requires existing explicitly linked actual work. It never creates or releases a reservation. Pickup/delivery occurrences can share one work block and its one reservation. There is no order/serving cap, rejection threshold, remaining-capacity state or spending cap. Pending changes preserve the plan; approved menu or work changes make it stale. A plan can be replaced before progress. After progress, replacement/correction requires a future reviewed command; no cancellation/refund/replanning policy is invented.

Operational flags are immutable events with separately recorded resolutions. A resolution addresses one manual flag; it cannot clear missed-selection, pending-change or payment flags owned by the other workflows. Payment failure and authentication requirements remain visible without changing the candidate, approved menu or fulfillment status.

`readTestOperations` returns a coherent chef-only report for **explicit IDs, maximum 100** (a request-size bound, not capacity or recurrence policy): candidate, approved/pending menu references, work IDs and projection drift, fulfillment status/staleness, payment collection and attempt states, notification status, and independent follow-up sources. Date/method summaries count only the supplied occurrences. `selectedServings` sums the explicit servings fields; it does not multiply them by quantity or define billing units. Missing approved menus are counted separately. Reports never control acceptance.

Both new service boundaries require `NODE_ENV=test`. Frozen `fulfillmentExecution` and `operationalReporting` controls remain false. No production route, admin execution screen, customer API, job, subscriber, payment adapter or email sink is registered. Production activation requires reviewed code and policy decisions, not setting an environment variable. Existing internal service methods remain trusted interfaces rather than public identity resolvers.

## Migration and recovery

`Migration20261031000800` follows PR7's `20261031000700` and adds only `meal_prep_fulfillment_event`, its indexes, same-occurrence references and guards. It changes no existing payment, private-event, Availability or shared-reservation tables. Database guards protect occurrence/method scope, approved-menu provenance, plan freshness, method transitions and append-only history. The service supplies authorization and actual-work checks.

Empty PR8 downgrade locks the new table, drops only PR8 objects, and permits all parent financial data to remain. Any PR8 event causes downgrade to fail before removal. Preserve history and use a forward fix. Do not cascade-drop obligations/reservations or weaken the shared reservation bridge to roll back a populated stack.

The [verification harness](../../scripts/verify-meal-prep/README.md) uses the installed Medusa runner for fresh install, exact-parent migration, populated upgrade, empty-PR8 rollback and reapply. Fixtures include manual collection, autopay setup/consent/revocation/invalidation, a failed attempt, webhook and notification dispatch/result. Full parent row hashes must match before/after every stage, including the PR7 collection source column. Existing legacy and shared-time suites separately cover active/completed/soft-deleted bookings, legacy conflicts/missing duration, claims, projection parity and rollback refusal. This is a representative local rehearsal, not a production-volume rehearsal.

## Validation and release gates

See the [full requirements-to-tests matrix](requirements-to-tests.md) and [owner testing instructions](final-owner-testing.md). Automated evidence uses Node 24.22.1, Yarn 4.5.0, PostgreSQL 16 and provider transport mocks with real Stripe webhook signature verification. Comprehensive results, exact final SHA, hosted CI URLs and automatic-review findings are recorded in the PR handoff. Ignored local reports are under `artifacts/meal-prep-verification`.

All D01–D12 remain unresolved. Required release work includes approved delivery/window/fee rules; actual timing/timezone/late-approval rules; pricing/grocery/payment terms and fee classification; cancellation/refund/paid-change/unpaid-service/pause policies; recurrence bounds/conflicts; customer access; and external-calendar assurance. Spending caps and automatic count-based capacity rejection remain excluded, not decisions to resolve.

Technical release gates remain: authenticated customer/admin execution UX; complete native Medusa paid-order/payment-session/capture reconciliation; actual Stripe Connect sandbox E2E; production email access/delivery and receiver deduplication; complete private-event checkout/ticket/additional-charge/fulfillment/email/receipt browser regression; production-scale migration; and the owner's final frozen-tip manual acceptance. Provider mocks and service tests do not prove those flows. Missing product decisions must be recorded in BTS-2 and incorporated into a version-bumped contract before dependent code activation. No release, merge, deploy, charge or real email is authorized here.

## ChatGPT → Arbor BTS-7 / BTS-3 handoff

Publish the PR URL, exact head/base SHA, CI run/artifact URLs, automatic OpenClaw review disposition, local totals, matrix and owner guide to BTS-7. To BTS-3, report that independent fulfillment state and operational visibility now use the existing approval/payment lock and shared-work boundaries; the architectural full V1 acceptance remains blocked by the listed product/technical gates. Ask BTS-2 for D01–D12 through the authorized owner; do not infer policy from test fixtures. No Arbor publication is performed by this agent. Existing OpenClaw review is triggered naturally by PR open/synchronize; no manual dispatch. The owner must explicitly approve after final local acceptance before any ordered merge/deployment work.

## Local execution evidence — 2026-10-31

On Node **24.22.1**, checked-in Yarn **4.5.0**, and a new loopback-only disposable PostgreSQL **16** container: **491 unique tests passed with none skipped** (280 Medusa unit/rendered, 15 storefront, 192 PostgreSQL integration, 4 legacy migrations). Both workspace typechecks and all backend/admin/storefront builds passed. The 12 method/recurrence operation snapshots were inspected. `git diff --check` passed. The final direct-insert SQL guard hardening was additionally verified by the **27-case focused fulfillment/payment-failure run** (unrelated cases deliberately filtered), another complete build/typecheck run, and another fresh/upgrade/rollback/reapply rehearsal. Parent PR6/PR7 row hashes were unchanged. No local test used live provider transport.

The pinned parent #27's latest complete-source automatic review reports no remaining blockers for the disabled foundation scope, **8/10 confidence**, at `f4557fab9d75b515611645be44bbabeb0bda1b10`. Its prior detached-method finding is fixed in that base. Carry-forward release gaps remain listed above. Exact-head hosted CI and PR8 automatic review are separate evidence, supplied in the final PR handoff; no review outcome is assumed here.
