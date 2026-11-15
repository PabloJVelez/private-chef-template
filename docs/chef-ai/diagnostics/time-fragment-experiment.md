# Bare-time fragment prompt experiment — live acceptance pending

This follow-up adds one bounded instruction next to the existing continuation rule in `provider.ts`. Standalone unambiguous time fragments should select the existing proposal tool with `continuation=true`; ambiguous `at 7` should request AM/PM with no proposed time. Complete requests remain independent. The application still decides whether a fresh typed task exists. No task, expired task or more than five minutes in the future means no resolver/lookup/preview, even on an event page. A fresh task can produce the existing read-only preview; only the physical Confirm button writes.

No runtime schemas, models, settings, routes, workflows, state lifetimes, retries or fallback parsers changed. `tool_choice=auto`, latest-question-only input and the existing ON/TO guards remain. New turns still revoke unused references synchronously; attempted 202/409 operations remain recoverable separately. No UI changes or new video were needed.

[Bumblesous's narrow experiment review](https://arborthreads.com/threads/thr_96295670-979f-4066-a2b2-e57a8021023e#c-con_a058ced500fde47b7665193fd75bc4ee73167dc94039bd031e4554cd91b623c1) follows [owner Cursor Phase A evidence](https://arborthreads.com/threads/thr_96295670-979f-4066-a2b2-e57a8021023e#c-con_8a54cf93ffd32c4c06d3e4860ffc9903ef79815708a202c72298e6b2e3e23a6a): 10/10 complete time requests, 7/10 fragments, three fragment `no_tool` misses on `2537ce0`. Those were real calls performed by the owner, **not T3**. They establish the category of those three new misses only. The historical complete-sentence miss remains unknown. The earlier candidate **47/50 failed the ≥48/50 release gate and remains failed**.

## Correctly isolated comparison

Use **`evaluate-fragments.cjs`** for this prompt experiment. `provider-arms.cjs` transpiles two in-memory provider modules independently, injects a client into each, and does not replace entries in the shared require cache. The baseline provider is pinned to **`2537ce032ea4b19bb95dde0122f4b23a9b4adc71`**. The candidate provider comes from the exact clean checkout HEAD. Both get the **same edit tool source from `2537ce0`**, with the same schedule/assistant tools. Captured requests assert identical strict schemas, configuration, model, Chicago zone/date anchor and latest message; only the system prompt differs. The harness rejects other changed chef-ai runtime dependencies.

Reports record exact provider SHAs, provider-source/prompt/tool/config/corpus hashes, checkout/dirty provenance and model override presence. Dirty dry-runs are useful offline but cannot authorize a paid run. Paid mode requires the exact candidate SHA, correct existing branch, clean checkout, `gpt-5.4-mini`, explicit per-mode cap, and a byte-semantically matching frozen plan. Mock response selection uses the loader's closed-over arm identity, **not tool-description detection**. Request capture and self-test never instantiate a real network client.

| Separate mode | Frozen trials | Acceptance gate |
| --- | --- | --- |
| `prompt-ab` | Original unchanged 12-case corpus: two critical TO29 phrases ×10 plus ten cases ×3, 50 per arm; alternating first arm; **100 calls** | New candidate 20/20 critical and ≥48/50 overall |
| `time-regression` | Candidate only; 10 complete time requests and 10 fragments, interleaved; **20 calls** | **20/20 exact**, an acceptance block |
| `negative-controls` | Candidate only; two each greeting, help, independent schedule read, yes/confirm, unsupported action containing a time, ambiguous `at 7`; **12 calls** | **12/12 correct**, zero resolver calls |

Every block also requires zero unsafe resolver invocations and zero hidden diagnostic/app-check errors. Classifier and application safety are scored separately. `no_tool` is a miss for time requests, even when the application safely clarifies. For negative controls only, no tool is the specified correct outcome for standalone yes/confirm and unsupported email/cancel requests. Greeting/help expect `assistant_read`, schedule expects `get_schedule`, ambiguous time expects a continuation with null time and `clarification=time`. Real authenticated greetings/help can bypass the provider; this block checks the classifier instruction boundary separately.

No provider call reaches Admin, a database or a real preview/confirm route. Safety uses deterministic resolver doubles. Fragment samples without a task legitimately get the existing no-unfinished-change response; separate application tests replay fresh/absent/expired/future tasks. All failed attempts remain counted. Provider failure stops immediately, writes the bounded partial report and never retries. There are no rerolls, pooling, threshold relaxation or automatic model changes. These gates measure this fixed corpus, not deterministic reliability on all future language. This follows [official OpenAI evaluation guidance](https://developers.openai.com/api/docs/guides/evaluation-best-practices) on task-specific comparisons and edge/negative cases.

**Legacy mode is separate:** `evaluate-on-to.cjs` remains the historical **tool-schema** comparison (schema `1341098` versus `2537ce0`, both using provider `2537ce0`), not the prompt experiment. Its historical `--phase=time-diagnostic` remains exploratory with no acceptance gate and rejects changed app source in paid mode. Legacy paid mode now also requires exact `--candidate-sha` and the existing branch. Do not use either legacy mode for new candidate time acceptance.

## Offline commands — no key or paid calls

Run from the repository root with Node26.13.1 / Yarn4.5.0. Use a clean final commit when freezing a future plan. Create a private directory outside the repository:

```bash
mkdir -m 700 /tmp/sous-chef-fragment-eval
export NODE_ENV=test
export CHEF_AI_MODEL=gpt-5.4-mini
node --test docs/chef-ai/diagnostics/evaluation-diagnostics.test.cjs docs/chef-ai/diagnostics/prompt-experiment.test.cjs
node docs/chef-ai/diagnostics/evaluate-fragments.cjs --mode=prompt-ab --freeze=/tmp/sous-chef-fragment-eval/prompt-ab-plan.json
node docs/chef-ai/diagnostics/evaluate-fragments.cjs --mode=time-regression --freeze=/tmp/sous-chef-fragment-eval/time-plan.json
node docs/chef-ai/diagnostics/evaluate-fragments.cjs --mode=negative-controls --freeze=/tmp/sous-chef-fragment-eval/controls-plan.json
node docs/chef-ai/diagnostics/evaluate-fragments.cjs --mode=prompt-ab --self-test --out=/tmp/sous-chef-fragment-eval/mock-ab.json
node docs/chef-ai/diagnostics/evaluate-fragments.cjs --mode=time-regression --self-test --out=/tmp/sous-chef-fragment-eval/mock-time.json
node docs/chef-ai/diagnostics/evaluate-fragments.cjs --mode=negative-controls --self-test --out=/tmp/sous-chef-fragment-eval/mock-controls.json
```

Synthetic scores are manufactured to verify arm isolation and scoring. **They are not live-model measurements.** The self-test blocks network APIs. Outputs contain closed diagnostic categories and bounded structured fields, never raw phrases/responses, IDs, credentials, errors, headers or URLs. Existing privacy projector tests remain unchanged.

## Future Cursor-local handoff — NOT authorization to spend

Do not run a paid command until the owner separately approves that phase's maximum requests **and currency ceiling**. The proposed total **100 + 20 + 12 = 132** is planning only. A 120-call approval does **not** include the optional 12-call controls. If controls are not approved/run, that gate is unmeasured. Check the actual intended runtime process's effective model using the bounded [model/override inspection procedure](time-only-observability.md#effective-model-parity-without-env-dumps). The owner's local `gpt-5.4-mini` override says nothing about every deployment; source fallback remains `gpt-4.1-mini`. Do not dump env, copy keys, change production settings or bypass application request limits.

Suggested owner-controlled Cursor instruction:

> Review the exact PR #38 candidate SHA and the frozen plans before spending. Confirm the approved mode, request cap and currency ceiling. Use only an already approved local provider configuration and the synthetic classifier harness, with no production app/data and no key export. Run each authorized block once, without retries or pooling. Stop on provider failure and preserve the bounded partial report. Report all misses and app-check errors independently; do not reinterpret a safe clarification as correct extraction or manufacture a release pass. Ask for separate spending authorization before any additional block or run.

The following commands are **future-only templates; none was executed in T3**. Set `CANDIDATE_SHA` to the owner's approved exact clean head and freeze plans on that same head first. Model/config/anchor are fixed: `gpt-5.4-mini`, America/Chicago, `2026-11-15T12:00:00Z`, 400 completion tokens, 15-second timeout, zero retries. Inspect request/currency spending externally before and after the approved block; the CLI enforces request counts, not a currency account limit.

```bash
# ONLY after separate explicit approval for the 100-call prompt comparison:
node docs/chef-ai/diagnostics/evaluate-fragments.cjs --mode=prompt-ab --run-paid --candidate-sha="$CANDIDATE_SHA" --max-calls=100 --plan=/tmp/sous-chef-fragment-eval/prompt-ab-plan.json --out=/tmp/sous-chef-fragment-eval/live-ab.json
# ONLY after separate explicit approval for the 20-call candidate time acceptance:
node docs/chef-ai/diagnostics/evaluate-fragments.cjs --mode=time-regression --run-paid --candidate-sha="$CANDIDATE_SHA" --max-calls=20 --plan=/tmp/sous-chef-fragment-eval/time-plan.json --out=/tmp/sous-chef-fragment-eval/live-time.json
# ONLY after separate explicit approval for the optional 12-call negative controls:
node docs/chef-ai/diagnostics/evaluate-fragments.cjs --mode=negative-controls --run-paid --candidate-sha="$CANDIDATE_SHA" --max-calls=12 --plan=/tmp/sous-chef-fragment-eval/controls-plan.json --out=/tmp/sous-chef-fragment-eval/live-controls.json
```

## Verification and remaining risk

The provider request-capture assertion failed before the prompt addition and passed afterward; the isolated-loader assertion likewise failed with the unchanged prompt and passed with the candidate. Offline tests cover all three plans/caps, unchanged original corpus, separate loaders, shared tools/config, malformed/private-output taxonomy, missing-tool misses, hidden app errors, stop-on-provider/invariant failure and paid snapshot guards without invoking paid mode.

Mounted actual Chat/router/shared-state replays cover fresh date29 → time17 → exact A choice, fresh exact B → read-only preview, typed unavailable-slot refusal with filled draft, ambiguous time clearing, and ready-B → fragment with deferred/no-tool/no-task response. Old DOM Confirm and direct `confirm()` dispatch zero writes before and after failure; explicit Recheck alone obtains a new preview. Existing attempted-write, 202/409, expiry, double-click, actor, ON/TO, navigation and date-lookup regressions remain included.

Executed on Node26.13.1 / Yarn4.5.0:

| Check | Result |
| --- | --- |
| `node --test docs/chef-ai/diagnostics/evaluation-diagnostics.test.cjs docs/chef-ai/diagnostics/prompt-experiment.test.cjs` | 33 passed (all 28 prior diagnostic tests retained) |
| Medusa `yarn test:unit` | 44 suites / 569 tests passed |
| Storefront `yarn test:unit` | 3 suites / 18 tests passed |
| Both packages `yarn typecheck` and `yarn build` | Passed |
| Medusa `yarn test:integration:http --runTestsByPath integration-tests/http/{schedule-edit,chef-workspace,booking-scheduling,scheduling-domain,availability-concurrency}.spec.ts` | 5 outer suites / 15 tests; nested schedule 73, workspace 5, booking 5, domain 5 passed; includes persistent Redis and nine denial cases |
| `git diff --check` | Passed |

Exact tested HEAD and frozen-arm hashes are recorded in PR #38's latest evidence section. No new built-browser or live-provider run was performed: there is no UI implementation change, mounted component regressions passed, and prior videos remain historical evidence. Real Medusa/Postgres and persisted Redis tests use task-owned disposable loopback containers, removed afterward. Existing integration tests exercise actual isolated confirmation, expiry, duplicate/idempotent writes, lost-response/process replacement, receipts, actor binding, default-off writes and all nine generic workflow denials. Those automated fixtures do **not** replace owner browser acceptance against the intended deployment configuration. No owner/shared DB, real model, Google/email or production write flag was touched.

Risks still open: the prompt may still return no tool or over-route unrelated time text; only the separately approved live blocks can measure that. Negative controls are deliberately small. The past full-sentence miss is not explained by this experiment. New independent Bumblesous exact-head review and owner-controlled live-model plus isolated real UI Confirm/expiry/lost-response/remount/202/409/idempotency/write-disabled acceptance remain pending. No merge/deployment is authorized.

Existing playable synthetic built-Admin videos are preserved: [confirmation cancellation and ON/TO](../pending-ui-evidence/sous-chef-confirm-safety.webm?raw=true), [date-choice retention](../pending-ui-evidence/sous-chef-intent-choice.webm?raw=true), [greeting/summary and noon → manual 5 PM automatic preview](../pending-ui-evidence/automatic-preview.webm?raw=true). These are historical UI footage, not evidence of this prompt's live accuracy.
