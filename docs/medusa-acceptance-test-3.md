# Private Event manual Test 3 follow-up

The handle correction was `c5fa93b0da25412d7d63e08862141be2a62ee0fb`, based on
`831c654b5d7915cb1a66b83a6715b7e9d13327fb`. The availability follow-up starts from
`c5fa93b` and preserves both revisions, including cleanup acknowledgment, the
claim/acquire/abort lock and reload-safe immutable Admin request. PR #31 is unchanged.

## Availability follow-up: a rejected slot is not processing

**Owner QA clarification:** the rejected requests were for 4:30 PM on November 9
and that arrival had already passed. Rejecting them was correct; this patch fixes
the misleading 202/processing response, not the past-time policy. The owner then
created two requests for the same future date at 4 PM (described as next Monday)
and reports accepting one successfully. That is owner-reported local happy-path
success. It does not establish duplicate prevention, product/email/calendar
delivery, cancellation cleanup or reload replay; those manual tests are continuing.

The owner's later 202 (157.843 ms) fails in `requireSlot`, before claim/acquire or
product creation. It does not demonstrate another handle failure or prove product
success. The earlier aborted/cleanup-complete SQL row was from **before** that POST;
it is not evidence of the latest attempt's state. We have not inspected the Mac DB.
The screenshot's Node 20.20.2 differs from the Node 24.22.2 fixture; no evidence
identifies that difference as the cause.

Source anchors:

- `src/lib/availability/query.ts`: `loadSchedule` and `requireSlot` now throw the
  narrow `AvailabilityPolicyError` for missing saved settings, an inactive
  experience, or a requested instant absent from the calculated slots.
- `src/workflows/accept-chef-event.ts`: only that typed availability error, the
  explicit missing-experience/timezone checks, and PostgreSQL's definite overlap
  rejection become native `StepResponse.permanentFailure`. Arbitrary `NOT_ALLOWED`,
  database timeouts and unknown provider/network exceptions are not classified as
  policy rejections. Existing advisory Google fallback is unchanged.
- The failing initial step supplies its event/attempt as native compensation data.
  Existing absence/ownership checks, conditional abort, owned reservation release
  (if one exists), and `completeAcceptanceCleanup` resolve the unclaimed attempt.
  Cleanup failure retains `resolved:false` and blocks replacement. No new state
  table, retry engine, scheduling policy or provider behavior is introduced.
- Both acceptance/recovery handlers return sanitized 409 policy messages. They
  omit partial workflow results from unsuccessful/incomplete responses. The Admin
  displays the known policy message; its SDK clears the immutable request only on
  the exact cleanup-complete acknowledgment. Genuine unfinished work remains 202.

### Optional read-only checks for remaining slot questions

Use the owner's existing local Admin session and database. Do not change settings,
release holds, reset Redis or edit workflow checkpoints to diagnose this.

1. Capture the **current** event with GET
   `/admin/chef-events/01M70EQY8KJDNQN7WD745FQDY1`, then use the ownership/state queries
   below under "Conditional recovery" to identify the current attempt. Read the
   clock in the actual API process environment, for example the same terminal's
   `node -e 'console.log(process.version, new Date().toISOString())'`. Compare with:

   ```sql
   SELECT clock_timestamp() AT TIME ZONE 'UTC' AS database_now_utc,
          "requestedDate" AT TIME ZONE 'UTC' AS requested_utc,
          "timeZone", "requestedTime", experience_type_id,
          "requestedDate" AT TIME ZONE "timeZone" AS event_wall_clock
   FROM chef_event WHERE id = '01M70EQY8KJDNQN7WD745FQDY1';
   ```

2. GET `/admin/availability` for saved timezone, weekly hours, date overrides,
   `notice_rules` and `google_mode`; GET `/admin/experience-types/<experienceId>`
   for active status, duration, buffers and arrival-slot restrictions. Use saved
   Availability `notice_rules` as the notice authority, not the experience's older
   notice fields. Compare the requested instant against now, notice days and the
   six-month horizon. For a different request, the date in an old handle is not a substitute for
   reading its stored request date. The owner has confirmed the earlier arrival expired.
3. GET `/admin/availability/preview?date=<YYYY-MM-DD>&experience_id=<experienceId>`
   using the requested day's date in the saved scheduling timezone. Compare the
   **exact UTC instant** against returned `slots[].start`, not just a clock label
   (DST can produce two instants). This is the existing complete availability read;
   503 is not evidence of a free slot. Preview has no current-event exclusion, while
   acceptance excludes its own internal reservation owner. Do not infer a
   self-conflict or release a hold solely from preview output.
4. Check actual protected intervals for **other owners** across the proposed
   occupied window, including reservations that start before it:

   ```sql
   WITH w AS (
     SELECT e.id,
       e."requestedDate" - make_interval(mins =>
         (coalesce(x.preparation_minutes, 0) + coalesce(x.travel_minutes, 0))::int) AS starts_at,
       e."requestedDate" + make_interval(mins =>
         (x.duration_minutes + coalesce(x.cleanup_minutes, 0) + coalesce(x.travel_minutes, 0))::int) AS ends_at
     FROM chef_event e JOIN experience_type x ON x.id = e.experience_type_id
     WHERE e.id = '01M70EQY8KJDNQN7WD745FQDY1'
   )
   SELECT r.owner_id, r.attempt_id, r.state, r.starts_at, r.ends_at,
          count(*) OVER () AS total_matches
   FROM scheduling_reservation r CROSS JOIN w
   WHERE r.deleted_at IS NULL AND r.state IN ('held', 'confirmed')
     AND r.owner_id <> w.id AND r.starts_at < w.ends_at AND r.ends_at > w.starts_at
   ORDER BY r.starts_at LIMIT 101;
   ```

   These are proposed-policy buffers, not a recalculation of historical bookings.
   If there is no experience or duration, resolve that configuration first. If
   `total_matches` exceeds 101 the displayed diagnostic list is incomplete.
5. If Google mode is enabled, GET `/admin/google-calendar` for connection/calendar
   and sync status, and inspect that calendar's actual busy events over the same
   occupied interval. Account for pending-request mirror exclusions. The existing
   warning "Google availability lookup unavailable; using internal bookings only"
   means no Google conflict was added from that failed lookup. Do not attribute a
   rejection to Google merely because a connection is configured. No live Google
   calls were made by these implementation fixtures.

### Retest or recover this availability rejection

For a **new patched rejection** with `resolved:true`, the SDK clears the rejected
request after displaying its reason. Keep the event pending, use the existing event
edit flow to choose an actually offered future slot (and an active experience),
then Accept once with a new request UUID. The rejected slot is never auto-accepted.
If cleanup is unresolved, finish the owned abort before replacing the attempt.

For an **already-persisted pre-fix retry**, fetch current state first. If still
pending with no finalized product, the same actor can POST
`/admin/chef-events/01M70EQY8KJDNQN7WD745FQDY1/acceptance/recover` with
`{"action":"abort"}`. Require `success:true,resolved:true`; preserve the original
browser payload until that acknowledgment. The next ordinary Accept acknowledges
and clears the old resolved request; then reschedule and submit a fresh attempt.
Alternatively, `{"action":"resume"}` uses the original execution/input: when the
native awaiting interval permits re-execution, patched policy rejection becomes
terminal with owned cleanup. Never edit stored checkpoint input or use a new
recovery UUID to bypass slot validation. A terminal pre-fix failure may need the
explicit abort to acknowledge cleanup.

If already confirmed/completed, a product is finalized, or outcomes are ambiguous,
retain protection and use the inspect/resume branch below. The earlier event's latest lifecycle state is still unverified here, but the owner
has confirmed its arrival expired and a separate future acceptance succeeded.
The new rejection-UX patch and the remaining manual QA cases still need owner validation.

### Availability follow-up verification

The pre-fix elapsed-arrival reproduction failed as expected: HTTP 202 in 93 ms,
no product/reservation, and an active unresolved attempt. Final patched evidence:

- The documented PostgreSQL/Redis selection passed 3 suites / 27 top-level tests,
  including the wrapper executing 5 additional Scheduling cases. All 23 native
  cases ran; no final selected case skipped. Expired and real-conflict cases
  returned resolved HTTP 409 in approximately 190/184 ms, without creating a
  product or releasing another owner's reservation.
- Expired rejection, same-attempt replay, supported reschedule, new-UUID acceptance
  and a stale old retry passed without checkpoint edits or SQL data mutation.
  Missing experience, timezone mismatch, inactive experience and absent settings
  are separately covered. PostgreSQL read failure and an unrelated `NOT_ALLOWED`
  remain 202/unresolved before acquisition; the read-fault fixture uses an actual
  100-ms PostgreSQL timeout. The Scheduling suite separately tests its real 5-second
  read deadline. Production retry intervals remain unchanged.
- Normal-config healthy routes with generated/provided uppercase IDs completed
  first-call in approximately 527/466 ms (finalized at 478/387 ms). These are Linux
  Node 24.22.2 handler measurements excluding startup, HTTP transport, browser and
  live providers, not an SLA or a Mac measurement.
- The genuine transient-after-acquisition case observes the native scheduled retry
  in the same live worker and then replays the original request successfully.
  Earlier fixture expectations assumed HTTP resume must already be complete and
  killed an in-flight native retry; those expectations were corrected before the
  final passing selection. Existing crash, product, duplicate/concurrent,
  finalized-booking and interrupted-cleanup cases remain in the full run.
- Backend units: 17 suites / 170 tests passed, including immutable reload input
  and policy rejection cleanup acknowledgment. Both workspace typechecks/builds
  and `git diff --check` passed.

External delivery is simulated. The owner's future-slot acceptance is separately
reported manual evidence; neither it nor these fixtures proves the remaining Mac
manual QA cases. No shared DB reset, Redis flush, migration, merge or deployment
was performed. Only task-owned fixtures were used.

## Earlier handle correction (c5fa93b)

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
state if it does not. **The new rejection-UX patch still requires owner retest. Future-slot acceptance is
owner-reported successful; the remaining manual behaviors are not yet verified.**

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

## Recorded handle-fix validation (c5fa93b)

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
