# Proposed-date visibility and boundary diagnostic

This follow-up starts at `1d419b5f07a17863bb2f0e827b0e1e2eff02cdb7`, preserving the removal of duplicate Details, chat bubbles, page context, automatic checks and recovery. It changes only proposed-intent presentation in production. Provider extraction, normalization, continuation merging, target resolution and write security are unchanged.

**The owner's historical live-model loss is still unresolved.** Its classifier payload was not recorded. This environment has no configured provider key or local application env file; no live OpenAI call was made or credentials copied. Controlled injected outputs demonstrate the downstream contract, not successful real-model interpretation. Repeat the live scenario locally using the bounded trace below before accepting the historical bug as fixed.

## What is proven

The mounted actual ChefChat/router → `answerSchedule` → strict `proposalSelectionInput` → `resolveEditProposal` → shared edit state diagnostic showed:

- With proposed `date={kind:day_of_month,day:29}`, page B + discussed A produces a choice with zero preview/confirm calls. Choosing A produces `{eventId:A,date:2026-11-29}` and preserves its saved 14:00; choosing B preserves its saved 10:00. A December event resolves to December 29 only after choosing that event.
- Injected `date=null,time=null,clarification=target`, and separately misplaced `targetDate=day29,date=null,time=null`, reproduce “What date or arrival time would you like?” safely, with zero preview/confirm. These are plausible reproductions, **not evidence of what the live model returned**. ON-target dates are never converted into TO-proposed dates.
- Before the UI change, four proposed-label assertions failed while five downstream behavioral assertions passed. The label now shows “Proposed date: 29th · Choose an event,” not an inferred month/year. ISO/month-day/relative expressions and time are rendered faithfully; absent proposed fields say “New date/time not captured.” The choice's actual submitted intent takes precedence over another unfinished task's presentation.
- Date plus later time continuation preserves the proposed date; explicit date/time clarification still clears only the field being clarified. An unrelated read or route change clears the unfinished task.
- Real authenticated Medusa HTTP/PostgreSQL fixture tests use A November 30 at 14:00 and B November 27 at 10:00, America/Chicago. With Sunday explicitly closed, selecting A returns typed HTTP 422 `slot_unavailable`, keeps November 29 populated and returns no signed reference/operation. With Sunday explicitly open, the signed preview binds A, November 29 and unchanged 14:00. Neither case confirms, changes the row, creates a receipt or dispatches Google.

## Recording and reviewer steps

[Built Admin date-choice walkthrough](pending-ui-evidence/sous-chef-intent-choice.webm) shows dark/light desktop and 390/320px mobile: B page → ask about A → “Can you move it to the 29th?” → visible ordinal → A/B choice → choose A → November 29 date-only preview refused by the fixture's closed-Sunday policy. No Confirm button or confirm/recover request occurs. The footage visibly labels **synthetic fixture / mocked model / no saves**. Browser interception tests presentation and requests; the separate real HTTP tests above verify domain policy and signed preview behavior.

[Earlier greeting / noon → manual 5 PM evidence](automatic-preview.md) and [page-awareness evidence](page-awareness.md) remain available. The new footage preserves the no-duplicate-Details UI.

For live acceptance on **disposable local events only**: open B, ask “What pending event do I have on November 30?”, then “Can you move it to the 29th?”. Before choosing, check that the captured proposed date visibly says 29th. Choose A; verify November 29 and unchanged 2 PM. Any refusal must come from actual configured policy; an open Sunday may validly preview. Do not click Confirm for this diagnostic. Repeat at least three independent runs (refresh each time), within rate limits, retaining failed traces as well as successes. If “New date/time not captured” appears, record the boundary trace rather than asserting the request was preserved.

## Cursor-local, opt-in bounded trace

`diagnostics/intent-trace.cjs` is a manually loaded debugger/test helper, **not imported by the application**. It defaults off, restricts browser use to loopback and rejects production Node. It stores at most 60 in-memory entries and exports only allowlisted typed intent/proposal fields, status/code, A/B aliases and a generated correlation UUID. It neither sends nor writes data. Never enable this on shared/production infrastructure.

1. Use an already configured local development provider and an authenticated Admin with disposable A/B records. Attach Cursor's Node debugger to the development server and browser DevTools to localhost Admin. Do not enable OpenAI request logging or export a Network HAR.
2. In the paused Node debug console, load the helper using `require(require('node:path').resolve('docs/chef-ai/diagnostics/intent-trace.cjs'))` from repository root (from `apps/medusa`, resolve `../../docs/chef-ai/diagnostics/intent-trace.cjs`). Create `globalThis.__scTrace = helper.createSousChefIntentTrace({enabled:true, aliases:{A:localAId,B:localBId}})`. IDs remain local inputs to aliasing; do not print/export those variables. Copy only `__scTrace.snapshot().correlationId` to the browser setup.
3. Paste the helper source as a temporary browser DevTools Snippet. Create `globalThis.__scTrace = createSousChefIntentTrace({enabled:true,correlationId:theSameUUID,aliases:{A:localAId,B:localBId}})`. Do not put IDs or credentials into a committed snippet. This diagnostic is manual; no application patch is needed.
4. Set the following source breakpoints. Execute only the matching expression at each pause; do not dump surrounding locals or raw provider responses:

| Boundary | Source location and bounded expression |
| --- | --- |
| Validated classifier | `lib/chef-ai/chat.ts`, immediately **after** `let intent = editIntentSchema.parse(...)`: `__scTrace.record('classifier', intent)` |
| After continuation merge | Same function, just before `await propose(intent, context)`: `__scTrace.record('merged', intent)` |
| Effective resolver | `lib/chef-ai/edit-proposal.ts`, inside `resolveEditProposal` after validation: `__scTrace.record('resolver', {intent,context})` |
| Returned task/choice/proposal | `api/admin/chef-ai/chat/route.ts`, after `answer` resolves, before `res.json`: `__scTrace.record('response', answer)` |
| Candidate click payload | Browser `chef-chat.tsx`, in `send` immediately before `client.fetch`, only when `selection` exists: `__scTrace.record('client-selection', selection)` |
| Read-only preview input | Browser `schedule-edit-state.ts`, immediately before `t.preview`: `__scTrace.record('preview-request', {eventId:s.eventId,...(s.date?{date:s.date}:{}),...(s.time?{time:s.time}:{})})` |
| Read-only HTTP outcome | At the local preview response boundary, record **only** `{status:actualHttpStatus,code:allowlistedPublicCode}` with `__scTrace.record('preview-outcome', ...)`; for success omit `code`. Never record the body/reference. |

5. Export only `JSON.stringify(__scTrace.snapshot(),null,2)` from each debugger. The common UUID and each side's ordered steps correlate the run. Reset to a new helper/UUID per repetition; never capture prompt text, event/customer DTOs, names, raw IDs, URLs, tokens, references or exception objects. These structured traces still contain proposed dates/times; treat them as local diagnostic data, not telemetry.
6. Compare classifier → merged → response task/choice → click selection → resolver → preview. Missing at classifier means investigate bounded extraction; present then lost means fix that specific application boundary. Preserve `clarification=date/time` clearing rules. Do not infer the historic output from a new success or injected test.
7. Delete debugger globals/snippets and breakpoints afterward. No normal shipped runtime logging is enabled. Tests can export synthetic-only traces with `BTS21_INTENT_TRACE_DIR=/tmp/bts21-intent-traces`; never export raw mocks or signed HTTP bodies.

## Verification

Node 26.13.1 / Yarn 4.5.0. Full 42 unit/component/transport suites: **533 passed**. Real integration: **69 schedule HTTP/PostgreSQL cases**, **5 persistent Redis/process cases** including all **9 generic-workflow route denials**, related workspace/booking/scheduling suites and availability constraints passed (15 outer wrapper tests). Both Medusa/backend/Admin and storefront typechecks and production builds passed. No live paid model, Google/email dispatch, shared database access, deployment or flag enablement.

Commands from repository root (ephemeral ports below are test fixtures, not application settings):

```bash
export PATH=/tmp/bts21-node26/node-v26.13.1-linux-x64/bin:$PATH
BTS21_INTENT_TRACE_DIR=/tmp/bts21-intent-traces node .yarn/releases/yarn-4.5.0.cjs workspace medusa test:unit
node .yarn/releases/yarn-4.5.0.cjs workspace medusa typecheck
MEDUSA_DISABLE_TELEMETRY=true node .yarn/releases/yarn-4.5.0.cjs workspace medusa build
node .yarn/releases/yarn-4.5.0.cjs workspace storefront typecheck
node .yarn/releases/yarn-4.5.0.cjs workspace storefront build
# In apps/medusa, task-owned bts21-intent-pg / bts21-intent-redis only:
BOOKING_TEST_DATABASE_URL=postgres://postgres@127.0.0.1:32799/booking_test_intent BOOKING_TEST_REDIS_URL=redis://127.0.0.1:32800 AVAILABILITY_TEST_DATABASE_URL=postgres://postgres@127.0.0.1:32799/booking_test_intent node ../../.yarn/releases/yarn-4.5.0.cjs test:integration:http --runTestsByPath integration-tests/http/schedule-edit.spec.ts integration-tests/http/chef-workspace.spec.ts integration-tests/http/booking-scheduling.spec.ts integration-tests/http/scheduling-domain.spec.ts integration-tests/http/availability-concurrency.spec.ts
# Back at repository root; built Admin with intercepted synthetic APIs:
LD_LIBRARY_PATH=/tmp/bts-browser-libs/root/usr/lib/x86_64-linux-gnu NODE_PATH=/home/openclaw/projects/bts/node_modules node docs/chef-ai/intent-choice-video.cjs
LD_LIBRARY_PATH=/tmp/bts-browser-libs/root/usr/lib/x86_64-linux-gnu NODE_PATH=/home/openclaw/projects/bts/node_modules node docs/chef-ai/pending-schedule-ui-acceptance.cjs
LD_LIBRARY_PATH=/tmp/bts-browser-libs/root/usr/lib/x86_64-linux-gnu NODE_PATH=/home/openclaw/projects/bts/node_modules node docs/chef-ai/page-awareness-video.cjs
LD_LIBRARY_PATH=/tmp/bts-browser-libs/root/usr/lib/x86_64-linux-gnu NODE_PATH=/home/openclaw/projects/bts/node_modules node docs/chef-ai/automatic-preview-video.cjs
git diff --check
```

T3 `preview_open` failed twice: “This host is missing libraries T3's browser needs.” Recording uses the existing unpacked Chromium libraries above; no host installation or native-T3 browser success is claimed.

Built-Admin regressions also passed: original acceptance **31 previews / 5 explicit mocked confirms / 2 explicit mocked recoveries**; page-awareness **2 previews / 0 confirms**; greeting/summary/noon→5 PM **10 previews / 0 confirms**; new date-choice recording **4 previews / 0 confirms / 0 recoveries**. All reported zero browser errors and zero unmocked routes. The recording is 50.76 seconds, 1280×900, 2,660,028 bytes; Chromium verified playback progress and seeking. The viewport changes within the recording cover desktop and 390/320px mobile. Supplemental [desktop choice](pending-ui-evidence/intent-choice-dark-desktop.png) and [mobile refusal](pending-ui-evidence/intent-refused-light-mobile.png) screenshots accompany the video.

Synthetic-only boundary exports are in [diagnostics/synthetic-traces](diagnostics/synthetic-traces). The mounted test traces use injected classifier outputs and mocked domain snapshots; they must not be represented as live model traces. The HTTP tests independently exercise actual Medusa/domain modules and a disposable database. The full suite passed before whitespace-only test formatting; the final focused formatter/boundary/lookup run passed **47 tests**.
