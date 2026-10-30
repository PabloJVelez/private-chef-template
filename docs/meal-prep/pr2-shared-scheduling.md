# Meal Prep V1 PR 2: shared occupied-time protection

Authority: [full Requirements Contract v1.1, artifact revision 4](requirements-v1.1-r4.md), supplied in full before edits, together with the reconciled architecture and stacked delivery plan. Assigned [BTS-5 objective](https://arborthreads.com/threads/thr_d00889d6-e4c7-4ec8-a9de-262e7dc76c98/extend-availability-and-shared-conflict-protection): extend Availability and shared conflict protection; this layer delivers shared PostgreSQL protection of actual chef occupied time. ChatGPT handles Arbor publication; this agent did not publish there.

## Verified stack boundary

- Origin: `git@github.com:PabloJVelez/private-chef-template.git`.
- Bound worktree: `/home/openclaw/.t3/worktrees/private-chef-template/feat-meal-prep-v1-shared-scheduling`.
- Base: `feat/meal-prep-v1-foundations`, [PR #16](https://github.com/PabloJVelez/private-chef-template/pull/16), **`d301128119e3c7667a48b48ca3a4f4070e14152a`**.
- Head branch: `feat/meal-prep-v1-shared-scheduling`. The PR body records the exact committed head SHA (a document cannot contain its own commit hash).
- Before edits: clean HEAD, fetched base, merge-base and PR #16 head all matched the required SHA. No extra parent commits or changes. Rechecked the remote base before delivery; PR #16 remains open and unmerged.
- PR #16 and its independent review were read. The Node-runtime caveat is addressed here with **24.22.1**. Hosted CI and production-scale rehearsal remain limits; this PR adds real full-runner disposable migration rehearsals.

No merge, deployment, production migration or provider operation is authorized or performed. Keep the stack unmerged for owner testing of the final tip.

## Implementation and compatibility

`sharedScheduling` is a dedicated internal integration module registered after meal-prep, Availability, chef-event and Google modules. Medusa 2.7's module migration loop is sequential in registration order; fresh installation was verified through its actual CLI, not only by invoking migration SQL in tests.

`chef_time_reservation` has one GiST exclusion constraint for active half-open `[start,end)` intervals on the same resource. `btree_gist` supplies text equality. Both source kinds use the explicit **`chef-default`** resource already used by this single-chef installation's Availability. Resource checks prevent creating another resource to bypass contention. `chef_id` on a work block is ownership scope, not a second parallel scheduling resource. Actor IDs, `acceptedBy`, customer IDs and payment accounts never select resources. Multi-chef/store tenancy would need an explicit resource migration before use.

Private-event AFTER-row triggers project every source change in the same PostgreSQL transaction. Confirmed/completed events and pending acceptance tokens reserve time; unclaimed pending, cancelled and soft-deleted events do not. The projection records source identity, source version (the legacy event's update timestamp, or work-block integer version), active/released state and claim token. Inactive source rows remain represented for parity. Existing source deletion removes its projection. There is no lease, timeout, expiry or background release of uncertain claims.

The existing `chef_event_no_overlap`, `chef_event_occupied_valid`, acceptance workflow, compensation, snapshots, and accepted-event/Google reschedule guards remain intact. No event commerce, payment, ticket, guest-count, provider or UI file changes. Adding the synchronous exclusion can reject a formerly free event interval when explicit meal-prep work occupies it; that is the intended cross-domain protection. Failure rolls the source write back before acceptance can proceed to commerce.

`chef_work_block` records explicit actual work (in-home, preparation, delivery or handoff). `chef_work_block_occurrence` links scoped foundation occurrences. Creating an occurrence does not create a reservation. Multiple pickup/delivery occurrences can share one block and therefore one reservation; no count, serving quota, duration formula or fulfillment-window appointment exists. An in-home block belongs to one occurrence. The composite foreign keys reject forged chef/customer/kind references. Links lock the block against concurrent movement/release.

The existing Availability query reads bounded intervals from the shared projection even while Meal Prep is disabled. This preserves reservations if a feature is later disabled. It retains the private-event pending-mirror filtering, timezone/hours/date exceptions, notice rules, search bound and advisory Google failure behavior. Internal projection read failures propagate; they do not silently remove protection. The Availability editor, save/discard behavior and Google controls are unchanged. No new UI requires a new browser flow; existing rendered component regression suites ran.

Direct DML against the projection is guarded by trigger context and exact source comparison. Source/projection TRUNCATE is explicitly rejected because it bypasses row triggers. The `chef_time_reservation_expected` and `chef_time_reservation_drift` views, plus `reservationDrift()`, provide parity inspection without exposing private details. Database owners can disable triggers or alter schema and remain a trusted maintenance boundary. No trigger claims to protect against an administrator intentionally removing it. Future schema generation must preserve these manually maintained tables, views and guards.

## Rescheduling boundary

`replaceUnlinkedWorkBlock` is an internal transaction primitive with no route, job or runtime caller. It checks trusted chef scope and expected block version, locks the current Availability row, checks its expected update timestamp, validates the complete occupied interval against global working hours, and updates the source interval once. The synchronous exclusion secures replacement time atomically; conflict or stale writes leave the original interval/version intact. Availability snapshot saves serialize on the same row. Later changes to working hours preserve existing reservations.

The global-hours check does not apply experience notice rules, a private-event six-month bound, a recurrence horizon, method windows, payment rules or a Google policy to meal prep. DST tests walk actual UTC instants without resolving an ambiguous customer-local request.

**This PR does not execute approved occurrence reschedules.** Linked blocks cannot be changed, released or detached yet. Pending reschedule requests preserve existing work. A future PR 5 approval command and reviewed migration must atomically validate all linked occurrences, their versions and relevant decisions, then replace schedule references/reservations and write approval/audit/outbox records. This temporary infrastructure guard is not a customer cancellation/recreate policy. D03/D06/D07/D09/D12 continue to gate dependent behavior. Availability editor-to-editor optimistic version handling also remains PR 3; this layer only adds serialization for the replacement primitive.

Generated Medusa CRUD remains internal persistence plumbing, not an authorization or approval boundary. No public customer/chef command is enabled. All PR 1 frozen feature controls are unchanged and false.

## Migration, audit and rollback

`Migration20261030000200` is isolated in the integration module. It:

1. Requires foundation tables and the existing event exclusion migration. Wrong ordering fails explicitly before schema changes.
2. Locks `chef_event` against writes for the transaction, audits active occupied intervals (including in-progress claims) for missing/nonfinite/invalid bounds and overlaps, and refuses to guess durations or skip bookings.
3. Creates the three additive tables, views, exclusion, and source-owned projection. Backfills existing sources and checks parity without changing any event row.
4. Installs synchronous source triggers, projection/link/work guards, and truncate guards before releasing the lock.

The normal reviewed sequence is PR #16's foundation migration and existing Availability migrations first, then this integration migration. Start code that reads the projection only after migrations succeed. Module registration order is part of this dependency; do not move the integration module earlier. All modules share PostgreSQL here; separate module databases would require a different integration architecture and are unsupported by this bridge.

Operational risks: the source write lock and index/backfill work can delay event acceptance; preflight representative volume and an operator-chosen lock/statement timeout before rollout. `btree_gist` must be available with suitable extension-creation privileges (or preinstalled in `public`). Retained completed/past event reservations match existing behavior and add storage/index cost. Drift inspection scans the projection and sources; it is an operator check, not a per-request full scan. No production-sized benchmark was performed.

Down migration locks sources/projection and refuses **any** existing meal-prep block/link/reservation, including released history, or unresolved projection drift. Once populated, use forward fixes. An empty/event-only rollback drops only this layer and retains existing event constraints, guards, records and the extension. It never drops `btree_gist`, which other modules may use. Do not roll back this migration while running code that queries its tables.

Read-only verification before any later activation:

```sql
select source_kind, source_id from chef_time_reservation_drift; -- must be empty
select source_kind, active, count(*) from chef_time_reservation group by 1,2;
select conname from pg_constraint where conname in
  ('chef_event_no_overlap','chef_event_occupied_valid','chef_time_reservation_no_overlap');
```

Claims requiring recovery must be reconciled with workflow ownership and commerce side effects. Use the existing token-scoped compensation only when appropriate; do not clear tokens solely because they are old. Administrative drift repair requires a reviewed source-based repair transaction, never deleting arbitrary reservations to make a conflict disappear.

## Decision register and contract mapping

All D01–D12 are unresolved, with no defaults or decisions introduced:

- **D01:** payment clock/timezone/anchor, DST and late approvals; blocks timers/autopay/reminders.
- **D02:** radius/ZIP combination and out-of-area/address behavior; blocks final delivery eligibility.
- **D03:** pickup locations, method windows/closures, notice applicability and fees; blocks customer-selectable scheduling and fee validation.
- **D04:** dish/serving, package and tailored pricing; blocks production price calculations.
- **D05:** groceries, deposits/true-ups and payment terms; blocks affected quotes/charges.
- **D06:** cancellation/refunds, changed prices and commercial skip/reschedule effects; blocks applying those transitions.
- **D07:** pause effects on generated occurrences; blocks applying pauses.
- **D08:** unpaid-service behavior; no cancellation or fulfillment block is approved.
- **D09:** recurrence bounds/end/replenishment/partial conflicts; blocks series materialization/confirmation.
- **D10:** customer access; blocks public customer APIs.
- **D11:** platform fee classification; blocks live collection.
- **D12:** external-calendar assurance; blocks changed Google failure behavior and any guarantee against racing external edits.

No unresolved decision blocks the independent internal protections delivered here. Automatic order/serving caps and spending caps remain excluded, not pending decisions.

Requirement → test/review evidence:

- **R09/R19 → T06/T07/T12/T13:** bidirectional PostgreSQL event/work races, overlapping in-home work, adjacent intervals, actual event claim/release methods, accepted/Google-style write guards, compensation ownership, cancellation/soft-delete restoration, source-trigger failure rollback, and old Availability/foundation suites. Event commerce unit regressions pass; full checkout/provider E2E is not claimed.
- **R08/R09 → T04/T06:** 30 occurrence links produce one reservation; occurrences alone produce none; ownership and in-home exclusivity are checked; no count-based acceptance logic or pickup-window reservation exists.
- **R12 → T06 foundation:** atomic unlinked replacement, stale/concurrent versions, pending request isolation, linked movement/release protection and both link/mutation race directions. This is not complete T05 approved occurrence rescheduling.
- **R09 → T07:** shared Availability read, internal read failure propagation, unchanged Google advisory fallback, rendered Availability/storefront regressions, global-hours/DST tests and actual settings-save serialization.
- **R01/R20 → T01:** exact contract remains in the workspace, pre-edit gates stated, all feature controls false, D01–D12 documented, no policy defaults.
- **R19 → T13:** additive backfill parity, malformed/overlapping legacy audit failures, out-of-order rejection, generated CRUD/direct SQL guards, drift detection, empty/event-only rollback, populated downgrade refusal, and full application migration-runner rehearsal.

No product-policy deviations. Linked occurrence approval/application, authenticated work-planning APIs, method setup/UI, recurrence, billing, notification jobs and external-calendar enforcement remain later-stack work. All three fulfillment methods, four selection styles and four recurrence patterns remain full V1 launch requirements, not claims of this PR.

## Executed validation — 2026-10-30

Toolchain: **Node 24.22.1**, **Yarn 4.5.0**, disposable loopback-only **PostgreSQL 16** Docker container. Host Node 24.16.0 was not used for verification. Installed the existing lockfile with `--immutable`; no dependency/lockfile changes.

- Medusa unit suite: **18 suites / 173 tests passed**.
- Storefront unit/rendered component suite: **2 suites / 15 tests passed**.
- Real PostgreSQL suites: **5 suites / 51 tests passed, none skipped**: 27 new shared-time cases, 20 existing foundation/Availability cases, and four standalone legacy-migration regressions.
- Workspace typechecks: **both passed**. Final Medusa typecheck also passed after the integration changes.
- Workspace builds: **Medusa backend/admin and storefront client/server passed**. Final Medusa build also passed.
- Full application `medusa db:migrate --skip-scripts --skip-links`: passed on an empty disposable database, discovering the new integration module after all source migrations.
- Actual runner `medusa db:rollback sharedScheduling`: passed with no work blocks, preserving private-event guards.
- Full-runner upgrade rehearsal: populated the preceding schema with confirmed, completed, soft-deleted, in-progress-claim and pending event fixtures, then migrated this layer. All five source rows were unchanged at SQL row comparison, three occupied reservations were active, ownership token was retained, drift was empty, and both existing event constraints remained. Repeated after the final overlap-audit change.
- `git diff --check`: passed.

Representative migration fixtures are not production-scale data. The full runner deliberately skipped link synchronization and data-migration scripts; no new Medusa links or data scripts exist in this layer. No live Stripe/Google calls, browser E2E, full checkout E2E or production migration occurred. Existing warnings: Yarn peers, storefront React `act`, VM modules, configured Jest force-exit, and Turbo's Medusa build-output warning. GitHub workflow files are commented out; hosted CI is not claimed.

Repeat verification from this branch with a disposable server only:

```bash
# Use the repository .nvmrc (24.22.1); invoke Yarn 4.5.0 via Corepack or the checked-in runner.
yarn install --immutable
yarn workspace medusa test:unit
yarn workspace storefront test:unit
# Set both URLs to the same explicitly disposable PostgreSQL server, never DATABASE_URL from a deployed app.
MEAL_PREP_TEST_DATABASE_URL="$PR2_TEST_URL" AVAILABILITY_TEST_DATABASE_URL="$PR2_TEST_URL" \
  yarn workspace medusa test:integration:http --runTestsByPath \
  integration-tests/http/shared-scheduling.spec.ts \
  integration-tests/http/meal-prep-foundations.spec.ts \
  integration-tests/http/availability-concurrency.spec.ts \
  integration-tests/http/availability-save.spec.ts
TEST_DATABASE_URL="$PR2_TEST_URL" yarn workspace medusa jest --runTestsByPath \
  integration-tests/availability/legacy-migration.spec.ts --runInBand --forceExit
yarn typecheck
yarn build
```

The database suites create/drop isolated random schemas. They intentionally use test-owner DDL for fixture reset/corruption simulation; normal application writers cannot use the guarded truncate path. Real module loading/transaction decorators and SQL are exercised, not SQLite or mocked concurrency.

Full-runner rehearsal uses a second empty disposable database, `NODE_ENV=test`, `FILE_PROVIDER=local`, and placeholder Stripe/Resend configuration only. Run `yarn workspace medusa medusa db:migrate --skip-scripts --skip-links`, inspect parity, then rehearse the restricted down/up path only while there are no work blocks. The integration suite contains the populated, corrupt, overlapping and rollback fixtures for repeatable verification.

## Handoff

Review the integration migration, module order, database-owner trust boundary, and replacement/linked-block guards before merging any layer. No automatic merge or deployment. PR 3 should branch from this PR's exact head for Availability extension and chef setup; D02/D03/D12 gate dependent production behavior. PR 5 must replace the temporary linked-block freeze with a fully authorized all-occurrence approval transaction and its regression tests. Do not enable scheduling until projection parity is verified and the relevant policy/approval paths are complete. ChatGPT transfers this handoff and review results to Arbor.
