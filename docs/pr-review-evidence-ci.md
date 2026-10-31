# Review evidence coverage and CI scheduling

This fixes the transport gaps behind PR #20's repeated partial 6/10 reviews. It
changes neither review criteria nor application behavior. **Source fix only:
the installed worker is not upgraded by pushing this branch.**

## Causes and changes

The collector duplicated full before/after source as a diff, spending its 300 KB
source budget before the last three verification files. It also began generation
while the exact-head application checks were still running.

- Supply full before/after source without a redundant diff. Keep every changed
  path in the manifest, disclose file/context/binary omissions, and continue after
  a large file so later small files are not starved. Reserve base-guidance space.
- Reserve approximately one third of the same 300 KB budget for related sources:
  relative imports, Markdown references, nearest manifests/runtime declarations,
  and touched modules' services, activation controls and migrations. Prioritize
  production dependencies before test fixtures; inspect at most 80 related blobs.
  Read regular Git objects only. No host paths, symlinks, filters, checkout,
  package scripts or PR executable code run. Aliases, dynamic imports and
  exhaustive consumer discovery remain explicit limitations.
- Fetch exact-head check runs and newest legacy status per context. Pending CI
  marks the delivery `waiting_ci`; the normal two-minute poll retries it. Empty
  or queue-only metadata gets 120 seconds to register application checks. Pending
  checks time out after 45 minutes without model generation; dispatch again after
  they finish. Failures/cancellation/skips/timeouts are terminal evidence, not
  successes or reasons to wait forever. Absent CI is not test proof.
- Supply up to eight exact-head Actions runs with up to 40 jobs/step summaries and
  40 artifact IDs, digests, expiry and provenance per run. These authenticated API
  results distinguish hosted execution from author prose and queue success.
  **Raw logs and artifact contents are not downloaded or executed.** The model
  still cannot independently execute tests. Oversized/unavailable metadata is
  disclosed rather than silently treated as verified.
- Fingerprint the CI snapshot. Reruns invalidate cached generation; a new check
  or changed result during model generation defers publication until CI settles
  and evidence is regenerated. Regenerations count toward the 20-call daily cap.
  Only `waiting_ci` deliveries automatically retry; existing crash/uncertain-write
  quarantine and final head/base/ref/draft/closed checks remain intact.

## Validation

```bash
python3 -m unittest discover -s .github/review -p 'test_*.py'
```

54 offline tests passed: real Git fixtures cover late `.cjs`/`.sql` source,
budget skipping, requirement/import discovery, base instructions and symlink/path
isolation. Queue tests cover pending/failed/absent CI, newest legacy statuses,
wrong SHAs, metadata failures, wait persistence/timeout, cached-result invalidation,
CI reruns during generation, daily regeneration limits and publication recovery.
A separate pull-request workflow runs this Python suite without model credentials.

Real bare-Git replay of PR #20:

- Head: `f53912525d0250f09d81b6cb4ddb445cbdf5ff3a`.
- Base: `a973be19824f0d14cd8ed0f3a49fe29de181f810`.
- **18/18 changed files** plus **22 related files** in 284,900 serialized bytes.
- All three previously omitted verification files, the full contract, capture
  ownership/revalidation, scheduling service/triggers, manifests and activation
  controls are included. Fourteen lower-priority related files remain explicitly
  omitted: bounded partial review, not whole-repository coverage.
- Fresh authenticated GitHub metadata replay includes successful
  [run 41160508785](https://github.com/PabloJVelez/private-chef-template/actions/runs/41160508785),
  completed `verify` steps and artifact `13027185819`. Hosted metadata is 8,760
  serialized bytes, below its separate 40 KB budget.

No live model call, review publication, queue/auth mutation, application build or
production action is needed to test this transport-only change. No confidence
score is prescribed or guaranteed. Source replay is distinct from a live worker
upgrade and model-generated review.

## Upgrade boundary

After owner review/merge, use the existing [image-only rollout](pr-review-event-404.md#safe-rollout--not-executed-by-this-change)
from the exact merged main commit. Do **not** rerun initial activation, reset
queue rows, remove quarantine or change credentials/skill/model/workflow pins.
The additive `ci_waits` and `generation_attempts` tables preserve existing state.
The `openclaw-v3` policy marker permits a deliberate fresh review of an unchanged
head without old-policy deduplication suppressing it. Existing deliveries remain
completed; dispatch a new request rather than replaying them.

Prove the upgraded worker with a fresh manual dry run after PR #20's CI settles:
check source coverage and hosted metadata, confirm no publication, then perform an
authorized published rerun. Do not enable model tools, PR execution, fallback
models, approval/merge authority or bypass ambiguous-write reconciliation.
