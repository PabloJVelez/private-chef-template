# Reduced Medusa-first booking backend

This milestone uses Private Events as the only service client. Scheduling owns
protected time; Private Events still owns validation, menu/pricing, event state,
and acceptance policy. Availability retains saved hours, timezone, overrides and
notice rules. Commerce, payment, fulfillment and providers retain their native
owners. There is no workspace redesign, new service implementation, recurrence,
generic command journal, global lock, custom workflow executor or dispatch worker.

Baseline: freshly fetched `main` at `fe64336c226d121ef3060a309cf6e570bd2de6dd`.
Pinned and tested Medusa framework/medusa: **2.7.0**, without dependency upgrades.

## Review order

1. Additive Scheduling module: `feat/medusa-scheduling-domain`, PR #31. Its first
   migration only creates the module table; it does not register a new authority.
2. Private Event integration: `feat/medusa-native-booking-backend`, based on the
   first branch. This layer registers Scheduling, adds acceptance bindings,
   transfers historical occupancy and retires the old overlap authority.

Treat the second layer as a coordinated backend maintenance change. Nothing in
this session authorizes merging, deploying, draining writers or migrating a live
server. The steps below are rollout/recovery instructions, rehearsed on fixtures.

## Native execution and the demonstrated gaps

| Operation / failure                            | Medusa 2.7 capability checked                                                                                                                                                                                                   | Minimal application addition and proof                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| ---------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| HTTP retry / changed input                     | `context.transactionId` identifies a workflow execution. Stored idempotent executions reuse results/input after process replacement; they do not reject changed HTTP bodies.                                                    | One event-owned `chef_event_acceptance_attempt` model binds actor, event, request UUID and normalized input. PostgreSQL tests reject changed input and another actor. This is not a generic receipt or phase journal.                                                                                                                                                                                                                                                                                                                                                   |
| Two first invocations of the same ID           | Concurrent native initial checkpoint upserts can raise `Workflow execution ... already exists`.                                                                                                                                 | Medusa's PostgreSQL locking provider serializes entry **per attempt**. Different events still race normally against the overlap exclusion. Native fixture proves one product for same-attempt duplicates and one winner for overlapping events.                                                                                                                                                                                                                                                                                                                         |
| Process loss after a `WAITING` checkpoint      | Default synchronous steps remain waiting on re-run. Native `retryIntervalAwaiting` permits continuation.                                                                                                                        | Application steps use awaiting retry 60 seconds, three failure retries at five-second intervals. No workflow timeout or reservation expiry. Fixture accelerates these intervals to one second and kills actual Node processes. An Admin retry/recovery call resumes a stranded execution; no automatic startup scan is claimed.                                                                                                                                                                                                                                         |
| Product committed, step response lost          | Native child IDs correlate executions, but do not atomically commit Product data and workflow checkpoints. The core 2.7 product workflow is not persisted by default; its local `setOptions` only applies after a graph change. | A narrowly named `create-private-event-ticket` **native createWorkflow** composes Medusa's product, variant, inventory/pricing, sales-channel/link and event steps with stored/idempotent configuration. Product data carries creation-time event/attempt metadata and `external_id`. Recovery verifies that metadata and restores the native `create-products` step response using the native registration API. Real Product/PostgreSQL/Redis crash test returns the original ID. No product-recovery table, handle/SKU adoption or global core-workflow modification. |
| Slow product writer / recovery / abort race    | Execution identity alone does not serialize concurrent writers.                                                                                                                                                                 | Native PostgreSQL locking, scoped to the product attempt, surrounds creation/recovery and explicit abort. The event's conditional abort/finalize commands decide the lifecycle race.                                                                                                                                                                                                                                                                                                                                                                                    |
| Finalized booking followed by dispatch failure | Native compensation executes after a later step fails. Subscriber retries cannot enqueue a missing event.                                                                                                                       | Conditional event finalization and abort prevent compensation from deleting a finalized product or releasing its time. Native continuation is tried first. Authenticated event recovery can launch a new stable recovery execution from the existing immutable attempt after a terminal failure. Process-kill and notification-failure tests preserve the booking and product.                                                                                                                                                                                          |
| Cancellation committed, release interrupted    | Module commits are independent.                                                                                                                                                                                                 | Time remains protected until an authenticated event-scoped cleanup retries release. Cleanup targets the cancelled attempt, and cancellation aborts an unclaimed attempt before reopening is possible. Stale-cleanup tests retain a newer attempt's reservation.                                                                                                                                                                                                                                                                                                         |

Acceptance and ticket executions deliberately have **no automatic retention
expiry** (`store: true`, `idempotent: true`, no `retentionTime`). The attempt
binding also remains after event deletion for retry/ownership history. This avoids
losing the correlation needed to resolve an ambiguous product or held interval.
Any future archival needs an explicit audit policy; this milestone adds none.

Product compensation uses native delete workflows, gated by event ownership.
A missing/failed/incomplete product read never proves absence. A live correlated
product or unfinished native child execution retains protection. Both `held` and
`confirmed` reservations block overlap, so interruption between event finalization
and reservation confirmation is conservative. There are no cross-module deferred
triggers or transactional label-synchronization requirements.

The private ticket composition intentionally uses the existing native variant
workflow for prices, inventory and links. This is not an exactly-once guarantee
for every nested commerce step. If an unhandled nested outcome cannot be verified,
retain time and use the explicit recovery/abort procedure. Native product creation
and deletion, not custom SQL, own commerce data.

## Acceptance API compatibility

`POST /admin/chef-events/:id/accept` keeps existing fields and accepts optional
`attemptId` (UUID). The Admin SDK saves that UUID in session storage across
network failures and reloads. A resolved failure clears it for a genuinely new
attempt. Legacy callers without the UUID reuse the event's stored current attempt;
after a resolved failure they must supply a new UUID to start new work. A changed
body or different actor cannot reuse the same binding. `acceptedBy` retains its
existing display meaning; authorization uses `auth_context.actor_id` separately.

The response remains `{ success, data }` and includes `attemptId`, `executionId`,
`pending` and `resolved`. HTTP 202 means processing/recovery is pending; the Admin
call site displays that state rather than reporting acceptance complete. HTTP 409
reports a resolved failure or work requiring recovery. Repeating the same request
never intentionally creates a fresh execution identity.

## Controlled migration / authority switch

Use the normal local PostgreSQL server. Automated tests create disposable databases
or transaction-local schemas on that server; no second manually managed instance
is required. Never run the repository's destructive reset scripts as part of this
migration, and never use production/staging credentials for these tests.

For a future approved deployment:

1. Back up, stop accepting writes, and drain old API/worker processes. Audit active
   acceptance claims and their native executions/products. Prefer resolving them
   with the old version before cutover. Do not start new workers beside old ones.
2. Run normal `medusa db:migrate` with this version, then the normal link sync if
   required by the deployment. Custom module order keeps Chef Events ahead of
   Scheduling. Do not reorder the module migration sequence.
3. The Chef Event migration adds the attempt binding and `acceptanceExecution`.
   Scheduling's additive migration creates its table. Its next migration locks
   `chef_event`, copies exact stored `occupiedStart`/`occupiedEnd`, and drops the
   old overlap constraint **in the same migration transaction**. It does not
   recalculate accepted intervals from current experience duration or buffers.
4. Confirm each nondeleted confirmed/completed event and active claim has its
   copied reservation with identical timestamps. Active historical claims become
   `held`, retaining their original token; accepted history becomes `confirmed`.
   Pending unclaimed, cancelled and soft-deleted events do not gain reservations.
   Invalid/nonfinite/conflicting data fails migration; it must not become an empty
   production schedule. Existing event snapshot and lifecycle guards remain.
5. Only then start the new API/workers and smoke-test request, acceptance,
   cancellation, digital ticket checkout, emails and Google in the approved
   environment. The event-local old-writer guard rejects newly generated legacy
   claim tokens. It does not claim to secure arbitrary privileged cross-module SQL.

There is one editable reservation authority after cutover. Chef Event occupied
fields remain historical snapshots and policy guards, not availability storage.
Reads use Scheduling; missing tables or query errors fail closed.

Historical active claims predate a stable execution identity. Migration preserves
their exact protection but does not invent a product ownership proof. If one
survives cutover, an operator must audit its original native execution and actual
commerce outcome before clearing the event's token with the event service and
releasing its `legacy-<eventId>` Scheduling reservation using the stored original
token. A handle/SKU match alone never authorizes deletion or adoption. Unresolved
claims remain protected; the new HTTP recovery route intentionally refuses to
pretend it can reconstruct legacy authority.

Rollback requires another approved maintenance window and writer drain. Prefer a
forward correction. The cutover migration's `down` first verifies every protected
reservation is represented by a live event's exact historical interval, then
reinstates the legacy exclusion before removing the old-writer guard. Orphan holds
or overlaps make rollback fail. Keep the additive table/attempt history while
reconciling; the additive module's down migration refuses to drop protected time.
Do not redeploy old writers without restoring legacy protection. Reapplying a
rolled-back cutover requires reconciling retained reservations first.

## Authenticated operator recovery

`POST /admin/chef-events/:id/acceptance/recover` is Admin-only, with a strict body:

- `{ "action": "resume" }`: re-run the current stable native execution. Retry after
  the awaiting interval if its checkpoint is still waiting. Uses stored input,
  never arbitrary workflow IDs, step IDs or reservation exclusions.
- `{ "action": "resume", "requestId": "<UUID>" }`: after inspecting a **terminal**
  failure, use a fresh native recovery execution bound to that same event/attempt.
  The server rejects this if the original execution is unfinished or succeeded.
  Retain the UUID on retries. This can finish publication/dispatch for a finalized
  booking, without replacing its product or reservation. Inspect prior dispatch
  before retrying: provider/event delivery is at least once, not exactly once.
- `{ "action": "abort" }`: explicitly abandon only the current pending acceptance.
  A per-attempt native lock, exact product metadata and draft-state checks precede
  conditional event abort. Native product deletion completes before time releases.
  Interrupted abort is retryable. Confirmed/completed products cannot be deleted
  through this command; there is no refund policy change.
- A cancelled/deleted event retries reservation cleanup. A newer event attempt is
  never an exclusion or release target inferred from a stale cancellation.

The original authenticated actor resumes/aborts an acceptance binding. Cancellation
and deletion remain authorized Admin actions. Ambiguous commerce state remains
protected until verified; no automated hold expiry exists.

## Local verification

Set explicit loopback fixture targets without echoing credentials. The database
role must be able to create/drop task-owned test databases. The Redis engine uses
random fixture queue names; cleanup unlinks only those queues and execution keys.
No shared Redis flush, volume deletion or working-database reset is used.

From the repository root:

```sh
node .yarn/releases/yarn-4.5.0.cjs install --immutable
# Export BOOKING_TEST_DATABASE_URL and BOOKING_TEST_REDIS_URL to verified local targets.
# AVAILABILITY_TEST_DATABASE_URL can use the same verified local PostgreSQL server.
node .yarn/releases/yarn-4.5.0.cjs workspace medusa test:integration:http --runTestsByPath \
  integration-tests/http/scheduling-domain.spec.ts \
  integration-tests/http/booking-scheduling.spec.ts \
  integration-tests/http/booking-migration.spec.ts \
  integration-tests/http/booking-native-execution.spec.ts \
  integration-tests/http/availability-concurrency.spec.ts \
  integration-tests/http/availability-save.spec.ts
node .yarn/releases/yarn-4.5.0.cjs workspace medusa test:unit
node .yarn/releases/yarn-4.5.0.cjs workspace storefront test:unit
node .yarn/releases/yarn-4.5.0.cjs workspace medusa typecheck
node .yarn/releases/yarn-4.5.0.cjs workspace storefront typecheck
node .yarn/releases/yarn-4.5.0.cjs workspace medusa build
node .yarn/releases/yarn-4.5.0.cjs workspace storefront build
```

The older legacy upgrade suite is additionally run from `apps/medusa` with
`TEST_DATABASE_URL` set to the same verified local target, `TEST_TYPE` unset, and
`NODE_OPTIONS=--experimental-vm-modules node node_modules/jest/bin/jest.js
--runInBand --forceExit --runTestsByPath
integration-tests/availability/legacy-migration.spec.ts`.

New DB/Redis suites fail when selected without required fixture configuration;
skips are not durability evidence. The multi-module fixture is isolated in a child
Jest process to avoid Medusa 2.7's process-global entity metadata colliding with the
existing single-module runner. Real PostgreSQL migrations, services, transactions,
exclusion, native Product/Inventory/Pricing/links, native PostgreSQL locks and the
Redis workflow engine are exercised. Email/Google event dispatch is captured by a
test event bus; external providers are not contacted. Live provider delivery,
production Redis persistence/HA configuration and an approved maintenance rollout
remain manual checks. Both existing application build commands are unchanged.

## Recorded validation

All selected checks passed against disposable PostgreSQL 16 and Redis 7 fixtures:

- Six HTTP integration suites: 22 top-level tests, including two isolation wrappers
  that execute 5 Scheduling-domain and 4 integration cases in child processes.
- Native Redis suite rerun after recovery guards: 10 tests passed, including actual
  process kills, original-product recovery, terminal notification recovery, and
  rejecting premature/new recovery of a successful execution.
- Legacy populated-upgrade suite: 4 tests passed.
- Backend unit suite: 16 suites / 166 tests passed.
- Storefront unit suite: 2 suites / 15 tests passed (existing React act warnings).
- Both workspace typechecks and builds passed. No selected DB/Redis test skipped.

The process-interruption tests kill application workers, not Redis or PostgreSQL.
They prove continuation using those live native services; Redis service-loss/HA
and live external provider delivery remain deployment checks.
