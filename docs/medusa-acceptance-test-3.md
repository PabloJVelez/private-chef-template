# Private Event manual Test 3 follow-up

This patch updates PR #32 from `831c654b5d7915cb1a66b83a6715b7e9d13327fb`.
It preserves that revision's cleanup acknowledgment, claim/acquire/abort lock and
reload-safe immutable Admin request. PR #31 and its branch are unchanged.

## Causes and correction

The descriptive part of the ticket handle was normalized before an uppercase
Medusa event ID was appended. Medusa 2.7 requires
`^[a-z0-9]+(?:-[a-z0-9]+)*$`. The same expression exists on pre-refactor main
`fe64336`; handle generation itself is not a newly introduced regression.

The parent product step treated native `invalid_data` as a transient failure.
With normal settings (three retries, five-second failure interval, 60-second
awaiting interval), the actual acceptance handler returned 202 while the ticket
child was already reverted. PostgreSQL showed a pending event, no product and a
held reservation. This explains the processing toast; it is not evidence that
healthy acceptance inherently needs asynchronous polling.

The complete new handle now uses pinned Medusa `toHandle` and `isValidHandle`,
including the deterministic ID suffix. Stored event IDs, SKU representation,
metadata, reservation authority and existing product URLs are unchanged. Native
product validation remains enabled. Native Product `invalid_data` errors use
`StepResponse.permanentFailure` in the enclosing step; transient retry settings
remain unchanged. Compensation still proves product absence and owns the event
before releasing time. Native invalid-data messages are replaced by fixed,
sanitized messages in the API and Admin toast.

Both acceptance and recovery return 409 for the known deterministic failure,
including when cleanup is still pending. `resolved` is true only after the existing
cleanup acknowledgment. The SDK retains the original request until that verified
resolution (or success). Genuine unfinished/transient work still returns 202;
normal success returns 200 only after finalization and the workflow completes.

## Fixture evidence and scope

Tests invoke the real authenticated acceptance/recovery **route handlers** against
native Medusa modules, PostgreSQL 16 and the Redis 7 engine. HTTP socket/auth
middleware, browser rendering, email and Google provider delivery are outside
this measurement; event dispatch is captured. Workers are separate Node processes.
The environment is Linux x86_64, Node 24.22.2, with loopback task-owned containers
and existing pinned dependencies, not a clean installation or a Mac benchmark.

Before the fix, both realistic-ID tests failed as intended: a normally generated
ID and `01M70EQY8KJDNQN7WD745FQDY1` returned 202 with held time and no product.
After the fix, both returned 200 on the first call with one published product and
confirmed protection. The generated-ID case also includes punctuation/repeated
separators. Native identity/metadata/SKU assertions keep the original uppercase ID.
The final full integration run measured approximately 499/471 ms to finalization
and 572/550 ms to handler completion, respectively. These are two observations,
not an SLA; startup, network and live provider latency are excluded. No accelerated
retry intervals are used in these cases or the new deterministic/transient cases.

A native Product validation failure is injected as invalid input to the **real**
Product service, not a mocked error/result. It produces one creation call, a
sanitized 409, verified compensation and no product. A separate transient failure
retains 202/protection and resumes after the normal five-second interval.

The stored-input fixture uses native claim/acquire commands and the native ticket
workflow to persist the pre-fix invalid handle. Replaying with patched code retains
that invalid child payload. An injected release failure leaves cleanup unresolved;
replacement is refused. Authenticated abort is retryable, acknowledges only complete
cleanup, and then permits a new request UUID. The new attempt produces one product;
stale old-attempt retries leave its confirmed protection unchanged. No workflow
checkpoint is edited. The fixture replaces a worker after its route response because
graceful shutdown can wait on scheduled compensation; this is not handler latency.

## Conditional recovery on the owner's Mac

The reported log does not establish the current state of
`01M70EQY8KJDNQN7WD745FQDY1`. No remote repair of that attempt has been performed.
Run the patched application locally using the owner's normal workflow. This patch
adds no migration and does not require a database reset or Redis flush.

First use the authenticated Admin GET `/admin/chef-events/01M70EQY8KJDNQN7WD745FQDY1`
to inspect `chefEvent.status`, `productId`, `acceptanceExecution` and
`acceptanceToken`. For an unfinished attempt, the following read-only queries on
that same verified local database show the minimum relevant ownership/state:

```sql
SELECT id, status, "productId", "acceptanceExecution", "acceptanceToken"
FROM chef_event WHERE id = '01M70EQY8KJDNQN7WD745FQDY1';

SELECT id, request_key, state, cleanup_completed_at
FROM chef_event_acceptance_attempt
WHERE id = (SELECT "acceptanceExecution" FROM chef_event
            WHERE id = '01M70EQY8KJDNQN7WD745FQDY1');

SELECT id, attempt_id, state, starts_at, ends_at
FROM scheduling_reservation
WHERE owner_id = '01M70EQY8KJDNQN7WD745FQDY1' AND deleted_at IS NULL;

SELECT workflow_id, transaction_id, state
FROM workflow_execution
WHERE transaction_id IN (
  SELECT "acceptanceExecution" FROM chef_event WHERE id = '01M70EQY8KJDNQN7WD745FQDY1'
  UNION ALL
  SELECT 'ticket-' || "acceptanceExecution" FROM chef_event WHERE id = '01M70EQY8KJDNQN7WD745FQDY1'
);

SELECT id, status, external_id, metadata->>'acceptance_attempt' AS attempt_id,
       metadata->>'chef_event_id' AS event_id
FROM product WHERE deleted_at IS NULL AND external_id = (
  SELECT 'ticket-' || "acceptanceExecution" FROM chef_event
  WHERE id = '01M70EQY8KJDNQN7WD745FQDY1'
);
```

Then choose based on observed state, using the Admin actor that authorized the
attempt. All POST examples target the same local authenticated API:

- **Confirmed/completed with a product:** do not abort or start another acceptance.
  Inspect the product and workflow state. If continuation is needed, POST
  `/admin/chef-events/01M70EQY8KJDNQN7WD745FQDY1/acceptance/recover` with
  `{"action":"resume"}`. A terminal dispatch failure follows the existing documented
  recovery procedure; verify prior delivery before any new recovery execution.
- **Pending, no event product, child reverted/failed on the known old invalid
  handle:** prefer POST to that recovery endpoint with `{"action":"abort"}`.
  The server checks current event/attempt and draft ownership, deletes only owned
  draft commerce data, releases only its reservation and records cleanup completion.
  A failed/ambiguous response is not cleanup acknowledgment: retain browser storage
  and retry the same abort after resolving the reported error. Do not supply a fresh
  recovery UUID to try to overwrite the ticket child's persisted input.
- **Pending with a child still running/waiting, a published product, mismatched
  ownership, or an unknown side-effect outcome:** retain protection. Inspect/resume
  the original execution using `{"action":"resume"}`; do not infer absence from
  the old log or delete/release data manually. Escalate unresolved ambiguity with
  those read-only results.
- **After an explicit `success:true, resolved:true` abort:** verify the old
  reservation is released and no correlated live draft remains. In the original
  Admin tab, the next Accept request acknowledges the old resolved failure and
  clears its saved immutable request; submit once more to create a new UUID. Do
  not clear storage before cleanup. If this tab contains an older UUID-only entry,
  first verify cleanup and that it matches this event's resolved attempt before
  removing that single legacy entry; never clear all session storage.

Retest Test 3 with an available future slot satisfying current notice/horizon rules.
The sample handle's date is not authority to accept a now-expired slot. For a fresh
healthy attempt, one Accept should return success and show the confirmed event and
its published ticket product. Record the network response and product/reservation
state if it does not. **Manual Test 3 remains unverified until the owner retests.**

## Reproduction commands

Use explicit verified local fixture URLs as in the main implementation guide.
From `apps/medusa`, with `BOOKING_TEST_DATABASE_URL` and `BOOKING_TEST_REDIS_URL`
exported, run:

```sh
NODE_OPTIONS=--experimental-vm-modules TEST_TYPE=integration:http \
  node node_modules/jest/bin/jest.js --runInBand --forceExit --runTestsByPath \
  integration-tests/http/booking-native-execution.spec.ts \
  integration-tests/http/booking-scheduling.spec.ts \
  integration-tests/http/booking-migration.spec.ts
```

The native suite retains process interruption, duplicate execution, overlapping
acceptance, finalized-product/time protection and interrupted abort coverage.
The Scheduling wrapper retains interrupted-cleanup replacement and stale cleanup
cases. The SDK unit suite retains immutable payload replay across client reload.

## Final validation for this follow-up

- Real PostgreSQL/Redis selection above: 3 suites / 19 top-level tests passed,
  including the wrapper that executes 5 additional Scheduling integration cases.
  All 15 native execution cases ran; none of the selected cases skipped.
- Backend unit suite: 17 suites / 169 tests passed, including SDK reload/cleanup
  and acceptance protection regressions.
- Both workspace typechecks and builds passed. `git diff --check` passed.
- The initial two realistic-ID reproductions failed before the fix as expected.
  Intermediate selected runs excluded unrelated cases, and fixture setup/teardown
  failures were corrected before the complete passing integration run.

No live provider delivery, browser-rendered manual acceptance, Redis service-loss
or production migration was tested. No shared database was reset. Only task-owned
containers, databases and Redis execution/queue keys were used.
