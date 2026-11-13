# BTS-21 pending-event date/time UI

This increment adds one explicit action to the existing nonmodal Sous Chef chat: a pending Private Event can be previewed and then confirmed for a date and/or local arrival-time change. The model still only reads schedules. Opening the chat, sending a question, clicking a suggestion, opening the edit form, and conversational “yes” never mutate an event.

Stack: `main` ← [#36](https://github.com/PabloJVelez/private-chef-template/pull/36) ← [#37](https://github.com/PabloJVelez/private-chef-template/pull/37) ← this increment. Verified clean managed branch `feat/sous-chef-pending-time-edit-ui-v1` started at remote backend head `10e2276972ff2fe5bf45c2bd5196d18e047902b0`. The parent stayed at that head during implementation. Review only; no merge, deployment, production flag, production data, or secret changes.

## Dedicated one-store configuration

- Use a dedicated single-chef/store database and explicitly attest `CHEF_AI_SCOPE=single_site`. Exactly one active Medusa store must be returned by the Store module; zero, multiple, or unavailable stores fail closed. The schema has no chef/store ownership column, so it cannot safely separate shared tenants.
- All existing, authenticated Medusa Admin accounts may read and prepare their own edits. Remove `CHEF_AI_ADMIN_USER_IDS`; it is obsolete and ignored. Medusa session/bearer authentication, current-account retrieval, MFA handling, and signed actor binding remain. Customer/anonymous/API-key callers are not granted access.
- Writes, preview, and recovery additionally require `CHEF_AI_SCHEDULE_WRITE_ENABLED=true`; the default is OFF. Keep the existing strong Admin JWT signing secret (at least 32 characters). Do not put credentials in browser variables.
- Save a valid IANA timezone in Settings → Availability. Event timezone/legacy-arrival consistency, experience eligibility, lead time, slot availability, pending status, acceptance concurrency, and reservation checks remain server-authoritative.
- Existing model settings and privacy/rate/cost caps remain unchanged. There is no new model tool, capability endpoint, per-chef role system, or action registry.

The exact workflow-specific HTTP denial in `src/api/middlewares.ts` and the nine-scenario regression in `integration-tests/schedule-edit/execution-boundary.ts` are unchanged. Generic workflow run/step endpoints cannot bypass the signed reference flow.

## UI and transport behavior

Only `source.type=private-event` / `status=pending` cards offer **Change date/time**. Selection uses immutable `source.id`; presentation IDs, names, and estimated calendar intervals never form command input. Repeated appearances share one attempted operation per event. Pending status alone does not imply eligibility.

The initially blank form omits an untouched date or time. **Preview** calls the dedicated route with `{eventId,date?,time?}`. The before/after view shows server-returned local fields, UTC instants, saved IANA zone, and five-minute expiry. Changing the form, selecting another event, cancelling, navigation, or identity change invalidates unused UI preview state and suppresses late responses. The server has no revoke endpoint: discarded references cannot be used by this UI and still expire server-side. Escape cancels an inline edit first; keyboard submission only previews. **Confirm change** is a separate button.

The narrow transport receives the dashboard's actual `backendUrl`, configured auth type, and SDK token getter through the existing mount. Session requests include credentials; bearer requests use the current token, with an auth-generation check after token lookup. CORS is preserved. It calls only `/admin/chef-events/schedule-edit/{preview,confirm,recover}` and validates response shape/status/operation identity. No global SDK patch. Installed SDK 2.22.6 really discards the structured 409 receipt into `FetchError('Conflict')`; the regression invokes that installed implementation before verifying this adapter retains it for confirm **and** recover.

200 saved/no_change, 409 recorded rejection, 202 unknown, 400/404/422 policy, 401/403 access, 503 configuration, malformed bodies, and network failures have distinct handling. Access/configuration refusals say **Schedule changes are unavailable**. A 20-second transport timeout means an unknown outcome after an attempted confirm, never proof of rollback. AbortController cancellation cannot undo a server mutation.

A receipt proves a historical outcome. It never overwrites query data or an event card with the receipt's old time. The UI invalidates the real `['chef-events']` prefix, reads the live detail record, and refreshes the latest calendar window through the existing workspace read without another model call. Earlier matching source-ID cards, including reads in flight during a save, are marked historical. A saved 11:00 receipt can coexist with a live 12:00 event. A failed live refetch leaves the result **SAVED**, with current view unavailable.

Pending time is **not reserved**. Google availability is advisory. `googleSync=requested` means dispatch acknowledgement, not synchronization. This command sends no customer notification and edits no status, price, menu, customer, or confirmed/cancelled/completed event.

## Attempt recovery and privacy

Before dispatching confirm, the UI synchronously writes and reads back a versioned same-tab `sessionStorage` item scoped by normalized backend URL + authenticated actor + event ID. It contains only the exact signed reference, operation/event/actor/backend identifiers, attempted timestamp, and manual recovery count. Storage failure prevents the write. References are never added to chat turns, model messages, URLs, localStorage, logs, or Sentry. sessionStorage is readable by same-origin scripts; it is **not an XSS vault**. Server authentication and signature checks remain authoritative.

An attempted reference survives panel close, route navigation, history trimming, and same-tab refresh. Empty chat displays **Recover outcome**. Nothing auto-confirms, auto-recovers, or polls. Recover is an explicit POST and can dispatch the existing attempt's pending Google sync. It never replays a changed operation. Unknown/network/403/503 recovery keeps the original reference; it does not enable another edit for the event. Three manual recoveries per attempt are permitted across refresh; persistent uncertainty requires operator reconciliation, with the tab kept open.

Terminal results remain displayed until **Done**, which clears their stored reference. Explicit logout/account change clears actionable state and references, and synchronous generations suppress late preview/confirm/recover results across remount. Recovery is **not guaranteed after logout, tab closure, browser storage deletion, or another device**. A transient chat configuration refusal does not discard an unresolved write. Do not manually delete an unresolved item to retry a write; reconcile the live event and backend durable receipt first.

## Disposable owner acceptance

1. Use an isolated database with exactly one store, a pending unclaimed disposable event, a consistent requested date/time and saved zone matching Availability, and an active experience with an available future slot. Configure normal Admin authentication and the server-side model settings or local fixture provider. Enable the write flag only in this disposable instance.
2. Sign in as Admin B (no allowlist setup). Ask for the event's date range. Confirm normal quick suggestions/read behavior, event links, nonmodal navigation, light/dark layout, and mobile scrolling.
3. Select **Change date/time** on the intended card. Verify no preview request occurs yet. Enter only a date, then only a time, and inspect that the other field is omitted. Check before/after local + UTC instants and saved zone. Change the input and verify the old confirmation disappears. Let an unused preview expire and re-preview.
4. Click **Confirm change** once. Verify only that pending event's requested date/time changes, old chat cards are historical, the calendar/detail refresh, and Google says dispatch acknowledgement rather than synchronized. Verify no customer notification. Test an ineligible pending card and writes OFF; the dedicated route refuses neutrally.
5. With the mocked built-Admin fixture below, simulate a committed save with a lost response, refresh to empty chat, then explicitly recover the original reference. Compare historical 11:00 with live 12:00. Test saved-then-refetch failure, 409 rejection, no_change, access refusal on recovery, unavailable sessionStorage, repeated clicks, and logout/identity switch during pending requests. Never simulate these faults on production.
6. Keep production writes OFF and stop at review. No existing PR should be merged or retargeted by these steps.

## Verification

All runtime checks used Node **26.13.1** / Yarn **4.5.0**, with no manifest/lockfile changes. Final immutable installation also passed on Node 26.13.1. The exact implementation commit is recorded in the verification addendum below and in the PR body.

| Check | Result |
| --- | --- |
| Medusa unit/component/transport suite | **33 suites / 328 tests passed**, retaining parent coverage with obsolete allowlist expectations updated |
| Schedule PostgreSQL / real Medusa HTTP | **43 cases passed**; A/B read, B own preview, cross-actor confirm/recover denial, deleted/anonymous/customer rejection, default-off flag, absent/multiple stores |
| Redis persistent workflow / process restart | **5 cases passed**, including the unchanged **nine generic-route denial scenarios** and valid controls, response/checkpoint loss beyond expiry, later-event protection, and dispatch-acknowledgement loss |
| Related integration wrappers | All four selected wrappers passed; existing workspace and Scheduling nested cases and availability-concurrency coverage retained |
| Medusa typecheck + backend/Admin production build | Passed; build lint reported **0 errors / 176 warnings** (repository warnings were not swept into this change) |
| Storefront typecheck + production build | Passed |
| Built Admin Chromium acceptance | Passed: light/dark, desktop, 390px mobile and 320px bounds; immutable selection, partial edits, keyboard/Escape, stale preview removal, one confirm, 409/no_change, lost response → empty-chat refresh → explicit same-reference recovery, recovery 403, live 12:00 versus historical 11:00, saved/refetch failure, storage failure prevents dispatch |
| Browser fixture requests | 13 previews, 5 confirmations, 2 recoveries; **0 browser errors / 0 unmocked routes** |
| `git diff --check` | Passed |

The T3 preview browser could not launch: “This host is missing libraries T3's browser needs (libatk-1.0.so.0, libatk-bridge-2.0.so.0, libXcomposite.so.1, libXdamage.so.1, libXfixes.so.3, libXrandr.so.2, libasound.so.2, libatspi.so.0).” Acceptance used the available Playwright Chromium and existing unpacked libraries. No host packages were installed. No native T3-browser success is claimed.

Screenshots: [dark desktop preview](pending-ui-evidence/preview-dark-desktop.png), [light mobile preview](pending-ui-evidence/preview-light-mobile.png), [recovered result on mobile](pending-ui-evidence/recovered-dark-mobile.png). These contain synthetic events only.

Exact commands from this managed worktree (test ports below belong to disposable containers created for this run, **not** a reusable application configuration):

```bash
export PATH=/tmp/bts21-node26/node-v26.13.1-linux-x64/bin:$PATH
node .yarn/releases/yarn-4.5.0.cjs install --immutable
node .yarn/releases/yarn-4.5.0.cjs workspace medusa typecheck
MEDUSA_DISABLE_TELEMETRY=true node .yarn/releases/yarn-4.5.0.cjs workspace medusa build
node .yarn/releases/yarn-4.5.0.cjs workspace medusa test:unit
node .yarn/releases/yarn-4.5.0.cjs workspace storefront typecheck
node .yarn/releases/yarn-4.5.0.cjs workspace storefront build

docker run -d --name bts21-ui-pg -e POSTGRES_HOST_AUTH_METHOD=trust -e POSTGRES_DB=booking_test_ui -p 127.0.0.1::5432 postgres:16
docker run -d --name bts21-ui-redis -p 127.0.0.1::6379 redis:7
# Assigned loopback ports: PostgreSQL 32785, Redis 32786.
cd apps/medusa
BOOKING_TEST_DATABASE_URL=postgres://postgres@127.0.0.1:32785/booking_test_ui BOOKING_TEST_REDIS_URL=redis://127.0.0.1:32786 AVAILABILITY_TEST_DATABASE_URL=postgres://postgres@127.0.0.1:32785/booking_test_ui node ../../.yarn/releases/yarn-4.5.0.cjs test:integration:http --runTestsByPath integration-tests/http/schedule-edit.spec.ts integration-tests/http/chef-workspace.spec.ts integration-tests/http/booking-scheduling.spec.ts integration-tests/http/availability-concurrency.spec.ts
# Rechecked after adding final Admin A/B HTTP cases:
BOOKING_TEST_DATABASE_URL=postgres://postgres@127.0.0.1:32785/booking_test_ui BOOKING_TEST_REDIS_URL=redis://127.0.0.1:32786 node ../../.yarn/releases/yarn-4.5.0.cjs test:integration:http --runTestsByPath integration-tests/http/schedule-edit.spec.ts
cd ../..
LD_LIBRARY_PATH=/tmp/bts-browser-libs/root/usr/lib/x86_64-linux-gnu NODE_PATH=/home/openclaw/projects/bts/node_modules node docs/chef-ai/pending-schedule-ui-acceptance.cjs
git diff --check
```

The database tests create random `booking_test_*` databases and remove only their fixtures. The outer schedule wrapper has six Jest tests: one executes the 43-case PostgreSQL/HTTP suite; the other five exercise persistent execution, including the alternate-route guard. HTTP tests use real Medusa authentication/middleware with fixture current-user/store services. Browser APIs are intercepted synthetic responses over built Admin assets; they are not a live paid-provider or production acceptance test. No live model, Google, customer email, production database, deployment, or hosted CI success is claimed. Private Arbor was not read or posted; the owner's reproduced final handoff/review supplied the scope.

## Arbor-ready handoff

BTS-21's next slice adds pending-event action cards, explicit actor-bound preview/confirmation, validated historical 409 receipt transport, and same-tab attempted-operation recovery. One-store access now grants existing authenticated Admin accounts without an allowlist, and fails closed for ambiguous stores. The workflow-specific alternate-route guard remains byte-for-byte unchanged. The UI preserves unknown outcomes, distinguishes saved from current-view refresh failure, marks historical schedule snapshots, and never treats Google dispatch as synchronization. Review the stacked UI PR before any merge or enabling writes; this work does not authorize deployment or production writes.
