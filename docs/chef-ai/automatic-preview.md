# Sous Chef: automatic checks and conversational basics

This follow-up updates existing PR #38 on `feat/sous-chef-pending-time-edit-ui-v1`, stacked on PR #37. It preserves the page-target conflict rules, chat bubbles, actor-bound signed references, durable attempted-operation recovery and workflow-specific HTTP denial. Review only: no deployment, production flag, shared data or secret changes.

## What changed

Manual date/time changes immediately discard the previous unused reference and hide Confirm change. A valid nonempty draft triggers the same dedicated read-only preview after 500 ms; unchanged inputs are deduplicated. Opening the form or clearing/entering invalid fields sends no preview. Date-only/time-only edits still omit the untouched field. There is no permanent Preview button; expiry, refusal and transient failure offer a small **Recheck availability** action. Nothing retries automatically after an error. Enter/form submit never checks or saves.

The shared state owns debounce cancellation and response generations, rather than a component effect that could loop on state publication. Only the latest actor/backend/event/editor generation can publish a result, and returned proposed fields must match the request (including unchanged fields). Navigation, cancellation, selection and identity changes invalidate pending checks. Expired previews cannot confirm. Automatic responses use a polite live status without moving focus or scrolling; the pending slot remains unreserved. An unresolved attempted write prevents a new preview for that event.

Preview policy failures now carry a bounded public code from explicit domain error types: `slot_unavailable`, `event_ineligible`, `timezone_mismatch`, `availability_unconfigured`, `experience_inactive`, `invalid_local_time`, or `preview_unavailable`. HTTP statuses remain unchanged; unknown exceptions expose no internal details. Only an actual slot refusal can carry the verified event ID/title/revision and rejected local date/time needed for a targeted explanation. Refusals contain no signed reference or operation identity. No arbitrary string is classified as a slot conflict.

For the synthetic QA RejectionK fixture, noon produces: **“Noon on Nov 27 isn't available for QA RejectionK. No change was made. Choose another time.”** Noon remains editable. The chef then manually enters 5 PM, which triggers a fresh server check and, if accepted, shows the verified 10 AM → 5 PM preview. This does not assert that 5 PM is available in the owner's real database. A refusal's verified target and typed unfinished intent can continue in the next relevant clarification within the existing short draft lifetime; unrelated questions/navigation/identity changes clear that focus. No transcript is retained or sent to the model.

“No change was made” applies to read-only preview refusal. It is never substituted for an uncertain attempted confirmation, durable 409 receipt, or recovery result. Existing 200/202/409 semantics, synchronous sessionStorage persistence before confirm, duplicate guards, manual bounded recovery and query invalidation remain unchanged. HTTP 401/403/503 do not prove rollback, and 429 requires a manual retry.

Standalone **hello** and **what can you help me with?** have concise deterministic responses. Common **what's this event about?** variants read the exact current Private Event. These shortcuts run after real Medusa Admin authentication, single-store attestation/store verification, existing-account retrieval, bounded input validation and per-user limits, but before provider/Availability configuration. A greeting prefix on an edit (`hello, move this event to noon`) does not take the shortcut.

The existing single classifier call gains one closed, non-effectful `assistant_read` schema for greeting/help/page-event/ambiguous-context variants. There are still no model-selected IDs, URLs, patches, workflows, raw history or fetched records in provider input, and no second model synthesis call. The page summary uses a narrow Medusa field projection: approved title, status, saved local arrival, category and guest count. No contacts, addresses, notes, payments or full customer DTOs are loaded or returned. Confirmed/cancelled events remain readable with writes OFF and without active experience/availability configuration. Missing saved timing is described as unverifiable, never guessed from the browser.

Explicit “this event” summaries read page B even after discussion of A; ambiguous “it” reads ask for verified exact-ID choices when targets compete. Explicit summary choices re-fetch the chosen record. Missing/deleted/inaccessible page records never fall back to A. A summary establishes fresh conversational focus only when its facts match the current domain revision. The existing **write** conflict (page B + fresh A) still requires a choice before any preview.

## Evidence and limitations

[Actual built-Admin video](pending-ui-evidence/automatic-preview.webm?raw=true) shows greeting/help, current-page summary, noon refusal, manually entering 5 PM, automatic checking, verified before/after and button-only confirmation. It includes dark desktop plus light/dark 390/320px mobile. The recording visibly labels synthetic API fixtures and mocked model responses. It sends **10 preview requests, zero confirm and zero recover requests**. The separate HTTP tests execute the real provider wrapper/Medusa routes/SDK/domain policy against isolated PostgreSQL; only the provider network boundary is mocked. No live paid-model interpretation, Google dispatch or email was performed. Live-model owner acceptance remains necessary.

Screenshots: [greeting and summary](pending-ui-evidence/automatic-summary.png), [noon refusal](pending-ui-evidence/automatic-refusal.png), [validated 5 PM](pending-ui-evidence/automatic-ready.png), [light mobile](pending-ui-evidence/automatic-mobile.png). Earlier [page-awareness](page-awareness.md) and [bubble](pending-ui-evidence/chat-bubbles.webm?raw=true) evidence remains intact.

Validation uses Node **26.13.1**, Yarn **4.5.0**:

- Full unit run: **40 suites / 499 tests passed**, followed by **10 rendered page tests** including two new summary rendering/selection cases.
- **67 actual HTTP/PostgreSQL cases passed**, including noon→5 PM through provider wrapper, chat route, typed transport and shared UI state; typed non-slot 422 reasons; greeting/help/summary without provider/write/Availability configuration; authentication and limits.
- **Five persistent Redis/process cases passed**, including the unchanged **nine generic-workflow HTTP denial scenarios**, lost-response recovery beyond expiry, concurrency and no duplicate dispatch. Workspace, booking-scheduling and scheduling-domain wrappers each passed five cases; availability constraints passed six cases.
- Both Medusa and storefront typechecks and production builds passed. `git diff --check` passed.
- Built-Admin legacy acceptance passed: **31 previews / 5 explicit confirmations / 2 manual recoveries**. The page-conflict walkthrough passed: **2 previews / zero confirmations or recoveries**. Both had zero browser errors/unmocked routes. Exact tested commit is recorded in PR #38.

T3 browser failed twice with “This host is missing libraries T3's browser needs (libatk-1.0.so.0, libatk-bridge-2.0.so.0, libXcomposite.so.1, libXdamage.so.1, libXfixes.so.3, libXrandr.so.2, libasound.so.2, libatspi.so.0).” The existing Playwright Chromium/unpacked-library workaround recorded actual built Admin; no host packages were installed.

## Commands

```bash
export PATH=/tmp/bts21-node26/node-v26.13.1-linux-x64/bin:$PATH
node .yarn/releases/yarn-4.5.0.cjs workspace medusa test:unit
node .yarn/releases/yarn-4.5.0.cjs workspace medusa test:unit --runTestsByPath src/lib/__tests__/chef-page-ui.unit.spec.ts
node .yarn/releases/yarn-4.5.0.cjs workspace medusa typecheck
MEDUSA_DISABLE_TELEMETRY=true node .yarn/releases/yarn-4.5.0.cjs workspace medusa build
node .yarn/releases/yarn-4.5.0.cjs workspace storefront typecheck
node .yarn/releases/yarn-4.5.0.cjs workspace storefront build
# Task-owned disposable containers; discover assigned ports for each new run.
docker run -d --name bts21-auto-pg -e POSTGRES_HOST_AUTH_METHOD=trust -e POSTGRES_DB=booking_test_auto -p 127.0.0.1::5432 postgres:16
docker run -d --name bts21-auto-redis -p 127.0.0.1::6379 redis:7
# This run: PostgreSQL 32797, Redis 32798.
cd apps/medusa
BOOKING_TEST_DATABASE_URL=postgres://postgres@127.0.0.1:32797/booking_test_auto BOOKING_TEST_REDIS_URL=redis://127.0.0.1:32798 AVAILABILITY_TEST_DATABASE_URL=postgres://postgres@127.0.0.1:32797/booking_test_auto node ../../.yarn/releases/yarn-4.5.0.cjs test:integration:http --runTestsByPath integration-tests/http/schedule-edit.spec.ts integration-tests/http/chef-workspace.spec.ts integration-tests/http/booking-scheduling.spec.ts integration-tests/http/scheduling-domain.spec.ts integration-tests/http/availability-concurrency.spec.ts
# Schedule wrapper rerun after updating prior assertions for the new truthful refusal copy:
BOOKING_TEST_DATABASE_URL=postgres://postgres@127.0.0.1:32797/booking_test_auto BOOKING_TEST_REDIS_URL=redis://127.0.0.1:32798 node ../../.yarn/releases/yarn-4.5.0.cjs test:integration:http --runTestsByPath integration-tests/http/schedule-edit.spec.ts
cd ../..
LD_LIBRARY_PATH=/tmp/bts-browser-libs/root/usr/lib/x86_64-linux-gnu NODE_PATH=/home/openclaw/projects/bts/node_modules BTS21_UI_EVIDENCE_DIR=/tmp/bts21-auto-browser-evidence node docs/chef-ai/pending-schedule-ui-acceptance.cjs
LD_LIBRARY_PATH=/tmp/bts-browser-libs/root/usr/lib/x86_64-linux-gnu NODE_PATH=/home/openclaw/projects/bts/node_modules BTS21_PAGE_EVIDENCE_DIR=/tmp/bts21-auto-page-evidence node docs/chef-ai/page-awareness-video.cjs
LD_LIBRARY_PATH=/tmp/bts-browser-libs/root/usr/lib/x86_64-linux-gnu NODE_PATH=/home/openclaw/projects/bts/node_modules BTS21_AUTO_EVIDENCE_DIR=/tmp/bts21-auto-video-evidence node docs/chef-ai/automatic-preview-video.cjs
git diff --check
docker rm -f bts21-auto-pg bts21-auto-redis
```

## Owner acceptance on a disposable local event

1. Open pending QA RejectionK, Nov 27, 2026, 10 AM, America/Chicago. Say **hello**, **what can you help me with?**, then **what's this event about?** Expect concise replies and the current event's saved facts. Repeat with writes disabled; summaries still work.
2. Configure the disposable fixture so noon is unavailable and 5 PM passes policy (the test uses a 4–8 PM availability override). Say **hello, move this event to noon**. Expect the exact-event noon refusal, no Confirm, and noon retained in the form.
3. Manually enter **5 PM**. Expect one read-only check after about half a second, no confirmation while checking, then verified target/Before 10 AM/After 5 PM and **Confirm change**. Keyboard focus stays in the input. No save occurs from typing, Enter, or saying yes.
4. Change the time again, cancel/navigate during checking, or let the preview expire. An old result must not restore Confirm. Retry only via a new valid edit or explicit Recheck availability. Only physically click Confirm on disposable data if you intend to save.
5. Repeat the existing page B + fresh A write-conflict and uncertain-write recovery scenarios. The new checks must never substitute another target or discard an attempted reference.

Arbor-ready handoff: noon was correctly refused; 5 PM is a new chef-selected proposal, never a model conversion. The UI now explains that distinction, automatically checks manual draft edits, and supplies authenticated grounded conversational basics. PR #38 remains the only review target; no merge or deployment.
