# New-turn confirmation cancellation and ON/TO semantics

Diagnostic follow-up: [time-only observability and separately approved phase budgets](diagnostics/time-only-observability.md). The owner subsequently measured 47/50 overall, below the gate. The procedures below are historical; use the latest diagnostic report contract and obtain separate spending approval before any live phase. No runtime parsing change is implied.

Follow-up to the changes-requested review at `13410980bc70eccfed494fc49acb3d94794987c3`. Same branch and PR #38, stacked on unchanged PR #37. No new endpoint, migration, executor, provider round trip or permission system.

## Confirmation safety

Every new submitted chat turn synchronously cancels any **unused** preview, reference and confirmation readiness before awaiting classification or HTTP. This includes information queries and “yes.” The draft remains visibly unvalidated: “Previous preview cancelled while checking your new request.” Pending debounce/in-flight checks are invalidated. Neither a failed retarget nor a provider error can restore the old Confirm button, and direct `confirm()` cannot dispatch it. Explicit **Recheck availability**, reselecting an event, or deliberately editing the draft can prepare a fresh preview. A new successful conversational proposal still uses the existing preview path.

Cancellation clears the application-held reference; it does not add a server-side JWT revocation endpoint. Previously issued stateless unused references still expire under existing server rules, but this UI no longer offers or sends them after a new turn. Already dispatched operations remain separately stored under their exact reference and actor/backend/event scope. New conversation, cancellation or panel dismissal neither drops that recovery state nor resends the write. The signed button-only confirmation, 409/202 semantics, default-off writes and generic-workflow HTTP denial are unchanged.

RED evidence: mounted Chat/router/shared-state tests showed B's old Confirm while the retarget classifier promise was unresolved; the shared-state test remained `ready`. **3 failed / 74 passed** before the fix. After the fix, both failure responses (no unfinished task / provider error), retained old DOM-button clicks and direct duplicate `confirm()` calls dispatch zero requests. Explicit recheck restores readiness. Existing historical-read tests now begin the save *before* the concurrent question, preserving the already-attempted lifecycle rather than relying on the prohibited old confirmation order.

## Date semantics and correction

The fixed single-call tool now describes each field separately:

- `targetDate` is the **EXISTING ON** date for finding an event, only with `target=date`.
- `date` is the requested **NEW TO** date, retained even when event identity is unresolved.
- Context/clarify targets require `targetDate=null`. Tool-level contrasting examples distinguish TO29, ON30→TO29, target-only fragments, ON29/time-only changes and TO tomorrow, preserving omitted month/year.

An application-owned guard checks the validated classifier output **before merging**, checks the effective intent **after merging**, and also checks direct exact-event selection. `target=context|clarify` plus nonnull `targetDate` (including both date fields populated) receives a specific ON/TO clarification with no event resolution, task, preview, signed reference or Confirm. Values are never automatically remapped or silently dropped. The deterministic correction path is the existing **Change date/time** action on the intended event's grounded schedule reply, followed by explicit manual date/time input. If the reply is collapsed, use **Show earlier messages**. Read the selected live event before editing when needed. There is no new stochastic clarification executor or semantic-choice state machine.

Correct TO29 still displays “Proposed date: 29th,” waits for exact A/B choice, then resolves against that selected event's saved month/year. A legitimate `target=date,date=null` continuation retains its proposed time, subject to the existing fresh-task requirement. Invalid/expired tasks, date/time correction semantics, availability policy and current-event re-fetch remain intact.

RED semantics evidence: **6 failed / 7 passed** before the field descriptions and guard; **13/13 passed** afterward. Mounted and real HTTP tests additionally cover contradictory outputs, exact manual correction, canonical ON/TO and the prior A/B/Sunday flows. The owner's five live trials establish classifier divergence at the old head; they are owner-provided evidence, not live calls performed here.

## Playable evidence and acceptance

[New built-Admin video](pending-ui-evidence/sous-chef-confirm-safety.webm) visibly labels **synthetic fixture / mocked model / no saves**. It shows:

1. B page, read A, deliberately target B at 2 PM; B is ready but unused.
2. Start “This is for the event on the 30th.” Confirm disappears before the delayed response. Clicking the retained old element dispatches nothing. The failure leaves no valid Confirm.
3. Explicit Recheck obtains a new B preview; no save is clicked.
4. Contradictory date classification produces ON/TO clarification with no preview.
5. Correct TO29 retains the ordinal, asks exact A/B choice, then A/November29 is refused under the fixture's explicitly closed-Sunday policy, preserving the draft.

Dark/light desktop and 390/320px mobile: **12 previews, zero confirmations, zero recoveries, zero browser errors or unmocked routes**. The actual UI and shared transport run over built Admin assets; API/model responses are synthetic. Separate real HTTP/PostgreSQL tests verify backend policy. Prior [greeting/noon→5 PM](automatic-preview.md), [page awareness](page-awareness.md) and [date-choice](intent-choice-diagnostic.md) videos remain available.

Owner local acceptance, using disposable records only: reproduce ready B → retarget before response → failure with no Confirm; deliberately recheck if B is still intended. For ambiguous ON/TO, choose the correct event's manual action and enter the date. Repeat the original natural phrases with the actual configured provider. No production flag or owner database was changed by this work.

## Live-model evaluation remains outstanding

This environment has no configured `CHEF_AI_OPENAI_API_KEY` or local application env file. No credential was requested/copied and no paid model was called. Improved descriptions and safe clarification **do not establish extraction accuracy**. Independent Bumblesous exact-head review and owner real-model acceptance remain required.

`diagnostics/evaluate-on-to.cjs` is a one-off classifier-only harness. It never calls Admin, preview, confirm, recover, DB, Google or email. It uses the actual installed provider code, fixed latest-only synthetic phrases, the existing configured model (default `gpt-4.1-mini`), America/Chicago and fixed local-today anchor. Baseline `1341098` and candidate differ only in `editIntentTool()` descriptions. Each provider import captures its own tool module; the Node module cache is restored afterward. Both arms' outputs are scored against the **current** semantic guard; this is not a measurement of baseline application write behavior.

Preregistered: 50 trials per arm, paired with alternating arm order. The two historically failing phrases each repeat 10 times per arm; ten other fixed ON/TO/date/time/fragment cases repeat three times each. Exact target/targetDate/date/time/clarification/continuation fields must match. **Candidate gate: 20/20 critical, ≥48/50 overall, zero unsafe resolver calls. Clarification is safe but not correct extraction.** Do not adjust cases, switch models, retry failures or stop after a few good responses and claim the gate passed.

Cursor-local procedure (clean exact candidate checkout; use only an already approved local application key/environment, never paste it into a command or artifact):

```bash
# Repository root, Node 26.13.1 / installed Yarn 4.5.0 dependencies.
node docs/chef-ai/diagnostics/evaluate-on-to.cjs > /tmp/sous-chef-on-to-preregistered.json
# Review/freeze the plan, configured model, provider account budget and 100-call limit first.
# Opt-in only: at most 100 total paid requests, 400 completion tokens per request,
# provider timeout 15s, zero automatic retries. This also incurs bounded input-token cost.
# NODE_ENV=development is for this standalone local classifier harness only.
NODE_ENV=development node docs/chef-ai/diagnostics/evaluate-on-to.cjs --run-paid --max-calls=100 --out=/tmp/sous-chef-on-to-live.json
```

Paid mode refuses a dirty checkout, absent key, missing explicit call budget, or an output path inside the repository. A provider error stops the run and retains the partial bounded report; do not automatically resume/retry. It saves case IDs, typed allowlisted intent fields, classifications/counts and commit/model configuration, not raw provider messages/errors/records/references. No production rate-limit bypass is involved: this is synthetic classifier evaluation outside application routes, not sending 100 requests to an Admin user.

Harness verification here: dry-run plus `--self-test --out=/tmp/bts21-on-to-self-test.json`. The self-test intercepts the provider client entirely and deliberately injects baseline contradictions versus correct candidate outputs; it verifies both schema arms, the 100-call budget, scoring, strict validation and reporting. **Those intentionally manufactured totals are not live-model metrics.** Report live accuracy only after the paid local run, followed by actual Admin fixture acceptance. If the gate fails, keep review blocked and use the bounded [trace procedure](intent-choice-diagnostic.md); no silent date rewriting.

## Tests and commands

Tested implementation/media commit: `383a8039647148a6d748340f09914b95b24e7633`. The following documentation-only commit records hosted verification. [Playable repository-hosted video](https://github.com/PabloJVelez/private-chef-template/raw/383a8039647148a6d748340f09914b95b24e7633/docs/chef-ai/pending-ui-evidence/sous-chef-confirm-safety.webm) requires private-repository access. Authenticated GitHub download returned HTTP 200 and byte-identical content (7,212,825 bytes); Chromium played and sought through the downloaded 128.24-second video. [Verification record](pending-ui-evidence/confirm-safety-hosted-verification.json). Final disposable PostgreSQL/Redis containers were removed after testing.

Node 26.13.1 / Yarn 4.5.0. Full unit/component/transport suite: **43 suites / 551 tests passed**. Real schedule HTTP/PostgreSQL: **73 cases passed**. Persistent Redis/process suite: **5 passed**, including **all 9 generic-workflow denial scenarios**, concurrent signed confirmation and recovery beyond preview expiry. Related workspace/booking/scheduling/availability wrappers passed. Both applications' typechecks and production builds passed; `git diff --check` passed.

Existing built-Admin browser checks passed: original UI **31 previews / 5 explicit mocked confirms / 2 explicit mocked recoveries**; page awareness **2 previews / 0 confirms**; greeting/help/summary/noon→manual5PM **10 previews / 0 confirms**. All zero errors/unmocked routes. Only explicit fixture buttons produced those older-suite mutations; the new video sends none.

```bash
export PATH=/tmp/bts21-node26/node-v26.13.1-linux-x64/bin:$PATH
node .yarn/releases/yarn-4.5.0.cjs workspace medusa test:unit
node .yarn/releases/yarn-4.5.0.cjs workspace medusa typecheck
MEDUSA_DISABLE_TELEMETRY=true node .yarn/releases/yarn-4.5.0.cjs workspace medusa build
node .yarn/releases/yarn-4.5.0.cjs workspace storefront typecheck
node .yarn/releases/yarn-4.5.0.cjs workspace storefront build
# apps/medusa; task-owned disposable bts21-safety-pg / bts21-safety-redis:
BOOKING_TEST_DATABASE_URL=postgres://postgres@127.0.0.1:32801/booking_test_safety BOOKING_TEST_REDIS_URL=redis://127.0.0.1:32802 AVAILABILITY_TEST_DATABASE_URL=postgres://postgres@127.0.0.1:32801/booking_test_safety node ../../.yarn/releases/yarn-4.5.0.cjs test:integration:http --runTestsByPath integration-tests/http/schedule-edit.spec.ts integration-tests/http/chef-workspace.spec.ts integration-tests/http/booking-scheduling.spec.ts integration-tests/http/scheduling-domain.spec.ts integration-tests/http/availability-concurrency.spec.ts
# Final schedule/security rerun after correcting B's fixture date/timezone:
BOOKING_TEST_DATABASE_URL=postgres://postgres@127.0.0.1:32801/booking_test_safety BOOKING_TEST_REDIS_URL=redis://127.0.0.1:32802 node ../../.yarn/releases/yarn-4.5.0.cjs test:integration:http --runTestsByPath integration-tests/http/schedule-edit.spec.ts
# Repository root: built Admin via established browser-library workaround.
LD_LIBRARY_PATH=/tmp/bts-browser-libs/root/usr/lib/x86_64-linux-gnu NODE_PATH=/home/openclaw/projects/bts/node_modules node docs/chef-ai/confirm-safety-video.cjs
LD_LIBRARY_PATH=/tmp/bts-browser-libs/root/usr/lib/x86_64-linux-gnu NODE_PATH=/home/openclaw/projects/bts/node_modules node docs/chef-ai/pending-schedule-ui-acceptance.cjs
LD_LIBRARY_PATH=/tmp/bts-browser-libs/root/usr/lib/x86_64-linux-gnu NODE_PATH=/home/openclaw/projects/bts/node_modules node docs/chef-ai/page-awareness-video.cjs
LD_LIBRARY_PATH=/tmp/bts-browser-libs/root/usr/lib/x86_64-linux-gnu NODE_PATH=/home/openclaw/projects/bts/node_modules node docs/chef-ai/automatic-preview-video.cjs
node docs/chef-ai/diagnostics/evaluate-on-to.cjs --self-test --out=/tmp/bts21-on-to-self-test.json
git diff --check
```

T3 preview failed twice with “This host is missing libraries T3's browser needs.” Existing unpacked Chromium libraries were used; no host installation or native T3-browser success is claimed. No live Google/email, production data, deployment, secret change or production write flag was involved.
