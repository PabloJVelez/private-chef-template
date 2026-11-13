# BTS-21: pending Private Event schedule write contract

Stack: [PR #36](https://github.com/PabloJVelez/private-chef-template/pull/36) → backend contract PR → future action-card UI PR. The backend PR starts at `877b6fd14853c56c9991cd8555b6f6d8bc2fc258` and targets `feat/chef-admin-ai-schedule-chat-v1`. No React write UI or model write tool is included.

## HTTP contract

All three endpoints are authenticated Admin POSTs under `/admin/chef-events/schedule-edit/`. They use Medusa session/bearer authentication, current-user retrieval, `CHEF_AI_SCOPE=single_site`, and a verified single active Medusa store (all current Admin accounts). A separate `CHEF_AI_SCHEDULE_WRITE_ENABLED=true` is required, including for recovery; absent/other values deny access. Nothing in this change enables it on any installation.

The configured Admin JWT secret must be at least 32 characters. References use domain-separated HMAC-SHA256 with that existing secret, not a new credential. The operator must supply a high-entropy secret; character count is only a minimum configuration check. Rotating it invalidates old references; reconcile outstanding operations before rotation. Access is explicitly site-wide, not a cross-chef tenancy boundary.

| Endpoint | Strict JSON body | Result |
| --- | --- | --- |
| `preview` | `{ "eventId": "immutable-card-event-id", "date": "YYYY-MM-DD", "time": "HH:mm" }`; date and/or time required | Read-only current/proposed local date, arrival time, timezone, UTC instant, event ID, expected revision, operation ID, five-minute expiry and signed `reference` |
| `confirm` | `{ "reference": "exact-preview-reference" }` | Revalidates authorization/policy, runs the small Medusa workflow and atomic domain command, or returns the original recorded outcome |
| `recover` | `{ "reference": "same-reference" }` | Returns durable historical outcome even after expiry/later edits; never reapplies event fields. Can finish an unattempted Google dispatch |

Bodies are limited to 6 KB. Extra fields, fuzzy identifiers, confirmation text, conversation history, patches and caller-chosen operation IDs are unsupported. The signed payload contains identifiers and normalized schedule data, not customer/contact/menu data. Responses use `Cache-Control: no-store`; request errors omit the reference from monitoring payloads.

### Framework execution boundary

The registered `edit-pending-event-schedule` workflow is an internal execution primitive: its normalized input is trusted only after the dedicated handler authenticates the caller and verifies the actor-bound signed reference. It is **not** a second public write API. Project middleware denies POSTs under `/admin/workflows-executions/:workflow_id/*` for this workflow, including core `run`, `steps/success`, and `steps/failure`. Matching uses the decoded workflow ID, so percent-encoding does not evade the guard. Other workflows are unchanged. This restriction applies to every authenticated Admin and regardless of the write-enable flag; use dedicated confirmation/recovery instead. Internal Redis execution/restart does not traverse this HTTP middleware.

The previous implementation left core dispatch exposed. Review reproduced an authenticated, non-allowlisted caller sending unsigned modified input with an allowlisted `actorId`. The regression now loads the installed core routes/validators together with project middleware through the actual Medusa HTTP loader, using fixture bearer identities, PostgreSQL and the production Redis engine (RBAC not installed). Nine denied cases cover modified/unsigned input, impersonation, a signed reference from another caller, disabled writes, encoded IDs, trailing slash, and both step callbacks. Every denial verifies unchanged event time and absent receipts; dispatch occurs only after the later valid dedicated confirmation. A harmless control workflow still executes, and dedicated HTTP recovery returns the saved result without another emission.

Successful preview example (identifiers/reference shortened):

```json
{
  "reference": "signed-reference",
  "operationId": "server-generated-uuid",
  "eventId": "event-id",
  "expectedRevision": "opaque-revision",
  "expiresAt": "2030-03-01T10:05:00.000Z",
  "current": { "date": "2030-03-09", "time": "10:00", "timezone": "America/New_York", "instant": "2030-03-09T15:00:00.000Z" },
  "proposed": { "date": "2030-03-11", "time": "11:00", "timezone": "America/New_York", "instant": "2030-03-11T15:00:00.000Z" },
  "reserved": false,
  "googleAvailability": "advisory"
}
```

Confirm/recovery returns `{ outcome, googleSync, historical: true, reserved: false }`. The nested `outcome` contains `operationId`, `eventId`, `outcome: saved | no_change | rejected`, `committedRevision`, and normalized date/time/timezone/instant. Rejection adds `reason`, sets `committedRevision: null`, and retains the *proposed* schedule, not a claimed save. A no-op retains the existing revision and dispatches nothing. `saved` means PostgreSQL committed the two schedule fields and `updated_at`; it does not promise the event still has those values when read later.

HTTP 200 = saved/no-change; 409 = recorded rejection without an event mutation; 202 with top-level `outcome: unknown` = processing/history unavailable/response uncertainty, requiring same-reference recovery. Preview validation uses 400/404/422, authorization 401/403, and missing strong signing configuration 503. A lost response is not proof of rollback. Expired, unused references cannot write; if no proof exists the response conservatively remains unknown. Missing history is never permission to mint an operation automatically.

The [action-card UI](pending-schedule-ui.md) retains the exact reference through refresh/retry, recover before offering another operation after uncertain delivery, label returned receipts as historical, and invalidate the exact event/calendar queries after a save. A fresh preview is required after an ordinary recorded rejection or an event change. This document describes the backend layer; the linked UI handoff describes its stacked increment.

## Eligibility and concurrency

- Reuse `wallClockToUtcJsDate` and `requireSlot` at preview/confirm. Reject gaps/folds, invalid/past/off-grid/unavailable slots, unavailable/inactive experience, inconsistent legacy arrival fields, and timezone differing from saved business availability. No event timezone/experience defaults are supplied. Business lead-time rules and availability changes are read again at confirm even if the event revision is unchanged.
- Only unclaimed `pending` events qualify. Product links, occupied snapshots, acceptance tokens, protected Scheduling reservations, active/finalized/missing acceptance attempts, and aborted attempts without completed cleanup refuse the edit. Cleaned aborted attempts permit a fresh preview. Unexpected reservations are never released by this command.
- The module-local transaction takes the same event row lock as `bindAcceptance` and cancellation. Claim/finalization UPDATEs also serialize on that row. Under the lock it checks the full event fingerprint (including PostgreSQL `xmin`, so unchanged `updated_at` cannot hide a bind/edit), the referenced attempt state and the existence of protected Scheduling time, then writes exactly `requestedDate`, `requestedTime` and `updated_at`.
- The Scheduling read under the lock is read-only; Scheduling retains exclusive ownership of reservation mutation. No cross-module transaction manager is passed. Existing availability/retime triggers and the Scheduling exclusion constraint remain intact. Legitimate acceptance acquires the event binding before creating a reservation, as in the parent code.
- Provider reads and dispatch run outside event row locks. Availability is a check, not a pending reservation: another confirmed reservation may appear after it, which remains accepted domain behavior. Google is advisory and read failure retains internal booking checks. Nothing claims secured time or Google-confirmed freedom.

## Why one small SQL receipt table is necessary

`chef_event_schedule_edit` contains only the operation ID, immutable normalized input, immutable outcome, dispatch acknowledgement state and creation time. The event edit and receipt INSERT commit in one module transaction. This is a command-specific proof, not a general action ledger or a multi-phase transaction system; previews do not insert rows. No event-column migration or new lock service was added.

The Medusa workflow uses persisted execution (`store`, `idempotent`, 30-day retention) with the preview operation ID. A workflow checkpoint is a separate commit from the event write. The production-style Redis-engine fixture kills the process **after the actual domain transaction commits and before the step returns**, verifies that native execution history exists without the completed step response, then replaces the process. A receipt recovers the original committed revision even with an expired reference, and a later `12:00` edit stays `12:00` when recovering the earlier `11:00` operation. This reproducible commit/checkpoint window is why native workflow history alone is insufficient.

Receipts have no automatic expiry and are intentionally managed through narrow SQL methods, without generated CRUD routes. Do not prune them while recovery references may be in use. The migration is additive; rollback refuses to drop a nonempty receipt table. Native workflow retention is not receipt retention.

Google dispatch states:

| `googleSync` | Meaning |
| --- | --- |
| `not_requested` | No-op/rejection; no dispatch |
| `pending` | Save committed; dispatch has never been claimed. Same-reference confirmation/recovery can claim it |
| `unknown` | Dispatch claimed; acknowledgement may be in flight or lost. Never automatically emit again |
| `requested` | Existing `google-calendar.sync-requested` emitter acknowledged; provider sync completion is unproven |
| `failed` | Emitter acknowledgement threw. Event save remains committed; delivery could still be uncertain. No automatic duplicate |

Claiming dispatch is a conditional SQL update before the existing event-bus emission. Thus a crash before emission after claiming it sacrifices automatic delivery in favor of truthful uncertainty and no duplicate emission. Operators reconcile `unknown`/`failed` through the existing Google integration. Tests also kill the worker after emission but before acknowledgement persistence and verify no second emission. This guarantees one dispatch attempt by this command, not exactly-once delivery by the external provider/event bus. No customer email/notification event is emitted.

## Validation and isolated reproduction

Validated on Node **26.13.1** and Yarn **4.5.0**. The host originally used Node 24; final checks used the official Node 26.13.1 archive verified against its SHA256 manifest. No lockfile/dependency changes.

Task-only PostgreSQL 16 and Redis 7 containers, loopback-published random ports, no mounted application data, no provider credentials. Each database suite creates a random `booking_test_*` database and removes only that database. The native worker refuses `NODE_ENV=test`; it boots real Medusa modules and the Redis workflow engine with providers replaced by local fixture emit/user services. A separate fixture loads the actual route exports and middleware through Medusa's HTTP loader and uses signed bearer JWTs over loopback HTTP.

Exact commands from repository root (Node 26.13.1 directory prepended to PATH):

```bash
node .yarn/releases/yarn-4.5.0.cjs install --immutable
cd apps/medusa
node ../../.yarn/releases/yarn-4.5.0.cjs typecheck
MEDUSA_DISABLE_TELEMETRY=true node ../../.yarn/releases/yarn-4.5.0.cjs build
node ../../.yarn/releases/yarn-4.5.0.cjs test:unit
BOOKING_TEST_DATABASE_URL=postgres://postgres@127.0.0.1:32781/booking_test_schedule BOOKING_TEST_REDIS_URL=redis://127.0.0.1:32782 AVAILABILITY_TEST_DATABASE_URL=postgres://postgres@127.0.0.1:32781/booking_test_schedule node ../../.yarn/releases/yarn-4.5.0.cjs test:integration:http --runTestsByPath integration-tests/http/schedule-edit.spec.ts integration-tests/http/chef-workspace.spec.ts integration-tests/http/booking-scheduling.spec.ts integration-tests/http/availability-concurrency.spec.ts
# After adding the actual HTTP loader test, rerun the changed suite:
BOOKING_TEST_DATABASE_URL=postgres://postgres@127.0.0.1:32781/booking_test_schedule BOOKING_TEST_REDIS_URL=redis://127.0.0.1:32782 node ../../.yarn/releases/yarn-4.5.0.cjs test:integration:http --runTestsByPath integration-tests/http/schedule-edit.spec.ts
git diff --check
```

Use ports assigned to newly created disposable fixtures, not an existing database. The URLs above are the exact isolated fixture URLs used for this run, not a reusable application configuration.

Results: immutable install, typecheck, backend/Admin build, **30 unit suites / 272 tests**, and all four selected integration wrappers passed. New coverage comprises **41 real PostgreSQL/HTTP contract cases and four persistent-engine process/retry cases**. Existing Scheduling and read/auth wrappers each ran five nested cases; the availability-concurrency suite ran six cases. The PR body records the tested commit SHA.

Limits: no live Google, email, model, production migration, deployment, browser/UI test, or full unrelated repository integration run. Provider dispatch is an instrumented local emitter; its database acknowledgement-loss behavior is real. Policy checks intentionally occur outside row locks and do not reserve pending time. Current-user verification is exercised with a fixture user service, with real Medusa bearer authentication separately. No shared write flag, environment file, secret or production data was changed.

## PR #37 execution-boundary correction verification

Follow-up checks on Node 26.13.1 / Yarn 4.5.0 used a detached review checkout continued on a fix branch, with matching dependency trees reused (not a fresh immutable install):

- Both Medusa and storefront typechecks and production builds passed, including both backend and Admin phases.
- All 30 Medusa unit suites / 272 tests passed.
- The schedule integration wrapper passed: 41 PostgreSQL/HTTP contract cases, four process/retry/crash cases, and the new nine-scenario execution-boundary case with valid confirmation/recovery and unrelated-workflow controls.
- Removing only the production middleware guard makes the new regression fail with HTTP 200 and a saved 12:00 event instead of denial; restoring the guard passes. This verifies the test detects the original defect.
- Disposable loopback PostgreSQL 16 / Redis 7 fixtures only; no live providers, production migration, deployed runtime, UI acceptance or hosted CI claimed. Writes remain default-off. No merge/deploy authorized by these results.

Reproduce with the existing `test:integration:http --runTestsByPath integration-tests/http/schedule-edit.spec.ts` command and fresh disposable `BOOKING_TEST_DATABASE_URL` / `BOOKING_TEST_REDIS_URL`. The workspace script supplies Jest's required `--experimental-vm-modules`; bypassing it without that flag fails migration loading rather than testing application behavior.

## Arbor-ready handoff

BTS-21 backend slice is stacked on PR #36's verified head. It adds a default-off, actor-bound preview/confirm/recover contract for one pending Private Event's date/arrival time, atomic acceptance-aware guards, and a small persisted receipt backed by real PostgreSQL + Redis-engine crash/restart evidence. Read-only UX remains intact. Next slice: action card UI using immutable event ID and exact saved reference, recovery after uncertain delivery, historical receipt labeling and precise query invalidation. Independent review should focus on the command receipt/dispatch uncertainty boundary and the acceptance row-lock race. Do not merge/deploy or enable shared writes as part of this handoff.
