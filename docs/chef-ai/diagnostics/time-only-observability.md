# Time-only classifier diagnostics — no parsing fix or paid run

This patch changes only local diagnostic scripts, offline tests and documentation. Application/provider source, prompts, tool schemas, selected model, scheduling policies, preview/confirm/recovery and production settings remain unchanged from `20b33b5ec200b2b6de4886438156631d9b397033`. Existing PR #38 videos remain valid historical UI evidence; no new UI/video is needed.

The owner reports candidate **47/50 exact**, below the preregistered **≥48/50** gate. Three time-only misses were labeled `invalid_contract` by the old harness. That label cannot reveal which boundary failed. This patch **does not identify their historical cause, repair time parsing, or pass the release gate**. The owner's live evidence is separate from the entirely offline checks performed here.

## Report contract

`evaluate-on-to.cjs` now uses the small pure `evaluation-diagnostics.cjs` projector. Shape/JSON/schema/diagnostic failures remain in the denominator. Successful strictly parsed responses retain only the existing allowlisted typed intent; no failed sample is repaired.

| Classification | Meaning |
| --- | --- |
| `no_tool` | Returned call list is empty |
| `multiple_tools` | More than one returned call; no call is selected |
| `wrong_tool` | Sole call is not the pending-edit tool |
| `args_too_long` | String arguments exceed **1000 JavaScript UTF-16 code units** (`String.length`), matching the existing application limit; **not bytes** |
| `invalid_json` | Arguments are not a string, or JSON parsing rejects the string |
| `invalid_schema` | Actual installed Zod edit-intent validation rejects decoded JSON |
| `diagnostic_internal_error` | Unexpected diagnostic failure or malformed result/error shape; never an inferred model error |

Successful classification remains `exact`, `contradictory`, or `safe_but_not_exact`. Contradiction/clarification is safe but not exact extraction.

Metadata is bounded: call count capped at 20 with an explicit cap flag; first five tool names restricted to `get_schedule`, `propose_pending_event_date_time_edit`, `assistant_read`, or `other`; sole-call argument JS length capped at 1,000,000 with a cap flag (null for non-string/no selected call). No argument content is exported. Multiple calls export no chosen arguments.

Schema failures include at most five `{code,path,category}` issues. Codes use a closed Zod-code allowlist. Paths contain at most six segments, restricted to `target`, `targetDate`, `date`, `time`, `clarification`, `continuation`, `kind`, `value`, `day`, `month`, `year`, `offset`; any other segment, including numeric keys, becomes `other`. Unknown issue codes also become `other`. Taxonomy is `time_format`, `root_edit_empty`, `missing_or_wrong_type`, or `other_schema`. These categories describe observed validation structure, **not hypotheses about the three past failures**. Issue messages, inputs, received values, arbitrary object keys, nested raw errors and stack traces are never serialized.

Rows contain fixed trial ID/repeat/arm and bounded classifier/application diagnostics. The report plan records candidate/harness SHAs, fixed corpus IDs/counts, model/configuration hash, Chicago/date anchor and request caps. The hash includes the fixed corpus, effective model and relevant provider/tool source hashes. Only known model names `gpt-4.1-mini` and `gpt-5.4-mini` are emitted; other names are redacted to `other` and distinguished by the hash. The frozen synthetic phrases live in script source and are not copied into result rows/reports. No user prompts, records, contacts, IDs, references, headers, URLs, credentials or raw model outputs are exported.

### Separate application safety check

Each returned classifier result gets `app_check=completed|expected_contract_rejection|diagnostic_error`, `resolverInvoked`, and `unsafeResolverCalls` (the bounded contradiction count, each capped at 20). `completed` means the application returned, not that extraction was correct or a preview occurred. Known syntax/schema/fixed-contract rejection before resolver invocation is distinguished from unexpected exceptions. An exception after the resolver ran is always a diagnostic error. An unexpected exception cannot count as clean merely because `unsafeResolverCalls=0`.

The acceptance gate now additionally rejects hidden app-check/internal diagnostic errors, skipped app checks or incomplete runs. Provider errors remain independent: `provider_failure` stops immediately without retries, records the attempted call in the denominator and preserves a partial report. It omits `app_check` because that check never ran; totals explicitly count skipped checks. The provider already throws before returning calls for missing choice, unacceptable finish reason or unsupported tool type. **Do not relabel old `invalid_contract` rows as token-limit failures.** No SDK exception logging or runtime instrumentation was added.

Classifier scoring remains independent of task state. A valid time fragment without a fresh task can return the existing no-task clarification with `app_check=completed` and zero resolver invocations. Offline tests separately exercise deterministic fresh/absent/expired tasks without feeding history to the model or changing runtime continuation behavior.

## Phase A — owner-controlled exploratory diagnostic only

**No spending is authorized by this document or this implementation run. No `--run-paid` command was executed here.** The owner must separately approve Phase A and its currency ceiling, then use an already approved local key. Do not request/copy a new key or use production/customer data.

Fixed candidate source: `20b33b5` plus this diagnostic-only revision. Paid Phase A verifies a clean checkout and that `apps/` and `packages/` are unchanged from that candidate. It requires the existing evaluated `gpt-5.4-mini` model explicitly; no automatic model switch. Fixed Chicago anchor: `2026-11-15T12:00:00.000Z`. Same provider request settings: 400 maximum completion tokens, 15-second timeout, no retries, no persistence. Corpus: ten independent trials each, strictly interleaved:

1. `Change its arrival time to 5 PM.`
2. `At 5 PM.`

Maximum **20 paid requests total**, fewer if a provider failure stops the run. The call cap is not a dollar-cost meter: input tokens also cost money. Freeze the corpus, model, source/config hash and approved spending ceiling before starting. The standalone harness never calls Admin or bypasses its 5/minute, 50/day/user, 200/day/process rate limits.

Exact Cursor-local procedure, after checking out the diagnostic revision on the existing local branch and installing the existing Node26.13.1/Yarn4.5.0 dependencies:

```bash
# Free: inspect/freeze the plan. Only this classifier process gets the model override.
CHEF_AI_MODEL=gpt-5.4-mini node docs/chef-ai/diagnostics/evaluate-on-to.cjs --phase=time-diagnostic > /tmp/sous-chef-phase-a-plan.json
# Free: all provider calls intercepted; network denied. This is not a live result.
NODE_ENV=development CHEF_AI_MODEL=gpt-5.4-mini node docs/chef-ai/diagnostics/evaluate-on-to.cjs --phase=time-diagnostic --self-test --out=/tmp/sous-chef-phase-a-offline.json
# DO NOT RUN until the owner separately approves Phase A and a spending ceiling.
# Use the already approved local application key in the process environment; never paste it here.
NODE_ENV=development CHEF_AI_MODEL=gpt-5.4-mini node docs/chef-ai/diagnostics/evaluate-on-to.cjs --phase=time-diagnostic --run-paid --max-calls=20 --out=/tmp/sous-chef-phase-a-live.json
```

Output must be outside the repository (including resolved parent-directory symlinks); production-mode diagnostics are refused. Self-test requires the intercepted provider and blocks HTTP/fetch networking; it cannot be combined with paid mode. A provider failure returns a nonzero exit with a bounded partial report and no retry. Keep every attempted sample/failure. Do not repair rows, silently rerun a failed request, pool runs, or sample until green.

Phase A always emits `exploratory=true`, `gatePassed=null`. Even a perfect 20/20 is **non-reproduction of the misses in this block**, not proof the bug is solved or that the original A/B release gate passed. Review the closed categories before authorizing any narrow field/format change.

### Later Phase B — separate approval required

Only if the diagnostic evidence justifies a narrowly scoped change, preregister a new 50/50 comparison (**100 paid requests**), with a separately authorized optional 20-call candidate time-only block. Do not implement or spend on that phase now. The original A/B generator, two critical phrases, expected semantics and 100-call cap are unchanged by this patch.

Maintain **20/20 critical**, **≥48/50 overall**, **20/20 candidate time-only**, zero unsafe resolver invocations and zero hidden application-check/diagnostic errors. If the optional time-only block is not authorized/run, its gate is unmeasured; do not claim it passed. That block must be preregistered for the newly justified candidate, not quietly run through Phase A's frozen-20b33b5 assertion. Maximum discussed across phases is **20 + 100 + 20 = 140 calls**, a planning ceiling **not spending authorization**. No threshold relaxation, pooled results or rerolls.

## Effective-model parity without env dumps

Both current application source and the default harness use `CHEF_AI_MODEL || 'gpt-4.1-mini'`; the owner's live experiment explicitly used `gpt-5.4-mini`. Do not extrapolate that evidence to a deployment with a different effective model.

Inspect in the **actual intended application's existing process/debugger environment**, not a fresh shell that may lack its override. Read only the model variable; do not dump `process.env`, provider configuration or keys. This bounded expression emits the known effective name and override presence; unexpected names are redacted, with a hash for local comparison:

```js
(() => {
  const override = process.env.CHEF_AI_MODEL;
  const effective = override || 'gpt-4.1-mini';
  return {
    modelOverridePresent: Boolean(override),
    effectiveModel: ['gpt-4.1-mini', 'gpt-5.4-mini'].includes(effective) ? effective : 'other',
    modelHash: require('node:crypto').createHash('sha256').update(effective).digest('hex'),
  };
})()
```

This is inspection only. It does not change production settings. Unexpected model names require local owner verification, not exporting arbitrary env content. Compare the actual effective model with the preregistered harness model; retain separate evidence for each configuration.

## Executed verification and review boundary

Offline RED: copied old classifier/app-check behavior failed **17 of 19** new expectations. GREEN: **28 offline tests passed**, including every failure category, secret-like tool names/keys, malformed JSON/non-string arguments, 1000/1001 JS-character boundaries, schema taxonomy/caps, malformed error getters, unexpected app exceptions, denominator/gate scoring, provider-failure early stop, fixed 50/50 arm isolation and 20-call Phase-A isolation. The synthetic provider deliberately manufactures old/new-arm differences to verify harness isolation; its totals are not model measurements.

Existing Medusa unit/component/transport suite: **43 suites / 551 tests passed**. Both Medusa/backend/Admin and storefront typechecks and production builds passed. `git diff --check` passed. Application source has no diff from `20b33b5`. No paid model, database/integration service, live Google/email, browser/UI mutation, production toggle, secret request or deployment was performed. Existing playable videos are preserved; no new video was made for this diagnostics-only patch.

Commands executed on Node26.13.1 / Yarn4.5.0:

```bash
node --test docs/chef-ai/diagnostics/evaluation-diagnostics.test.cjs
node docs/chef-ai/diagnostics/evaluate-on-to.cjs
node docs/chef-ai/diagnostics/evaluate-on-to.cjs --self-test --out=/tmp/bts21-observe-self.json
CHEF_AI_MODEL=gpt-5.4-mini node docs/chef-ai/diagnostics/evaluate-on-to.cjs --phase=time-diagnostic
CHEF_AI_MODEL=gpt-5.4-mini node docs/chef-ai/diagnostics/evaluate-on-to.cjs --phase=time-diagnostic --self-test --out=/tmp/bts21-observe-phase-a-self.json
node .yarn/releases/yarn-4.5.0.cjs workspace medusa test:unit
node .yarn/releases/yarn-4.5.0.cjs workspace medusa typecheck
MEDUSA_DISABLE_TELEMETRY=true node .yarn/releases/yarn-4.5.0.cjs workspace medusa build
node .yarn/releases/yarn-4.5.0.cjs workspace storefront typecheck
node .yarn/releases/yarn-4.5.0.cjs workspace storefront build
git diff 20b33b5 -- apps packages
git diff --check
```

Still outstanding: separate owner-approved paid Phase A, any evidence-justified Phase B, independent Bumblesous exact-head review, and owner-controlled isolated real Confirm/expiry/lost-response/recovery/write-flag-off acceptance. Earlier fixture security/recovery results are historical evidence, not rerun integration claims for this patch. All three PRs remain open/unmerged; no deployment is authorized.
