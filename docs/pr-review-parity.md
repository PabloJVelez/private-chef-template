# Automatic and manually requested review parity

Both entry points use the same installed `pr-review` skill and inspection lenses,
Astra/High model, collector, bounded investigation loop, evidence freshness checks,
and COMMENT-only publication. The caller does not supply a desired score.
Model judgments can vary; materially different source or verification coverage
must not depend on whether an event or a person requested the review.

## Changes from v3

- Keep full head source and the complete unified base-to-head delta when that is
  smaller than a second full file. New/deleted files retain their full applicable
  contents. Regular Git blobs only, no checkout, textconv, filters or PR execution.
- Read at most 128 KB per blob and 400 KB of initial source evidence. Recover
  deferred changed files before optional references, including both sides of the
  change. Do not mark an after-only dependency read as complete diff coverage.
- Include relative imports, linked requirements, module guards/migrations and
  manifests. Avoid recursively visiting every module registered by Medusa config.
  These are bounded static discovery, not exhaustive consumer analysis.
- Missing changed-source coverage stops generation before a scored review. The
  failed delivery requires operator investigation and a fresh dispatch; it does
  not publish an incomplete review as though it finished. Large/binary changes
  still require an explicit alternate review, not relaxed limits.
- The isolated model may request up to three rounds of repository-relative
  base/head blob reads and literal head searches, eight items per request. The
  trusted controller performs them, never a model tool or arbitrary command.
  All rounds retain the same skill and accumulated evidence. Search output is
  limited to 20 KB; combined investigation evidence to 600 KB. Missing results
  and limits are explicit. Exhaustion stops without publication. Every additional
  model invocation counts against the existing daily 20-call budget.
- Inspect up to three non-queue exact-head artifacts. Authenticate the GitHub
  endpoint, validate run/head identity and SHA-256 digest, then follow its signed
  storage redirect without credentials. Limit compressed bytes (2 MB/archive),
  expanded bytes (12 MB/archive), entries (80) and members (3 MB). Reject traversal,
  symlinks, encryption and duplicate names. Never extract or execute contents.
- Supply report inventory and provenance, Jest totals and nonpassing scenarios,
  bounded text/log excerpts, matching `head.txt` when available, and before/after
  migration row-hash comparison. Missing keys remain unknown; failures/skips are
  not rewritten as passes. Passing assertion details are in test source, not all
  repeated in the report summary. Unsupported formats and excerpts are explicit.
- Include review-thread resolved/outdated state. Artifact identity/expiry and
  workflow attempts participate in the CI fingerprint, so changed evidence
  invalidates a cached draft before publication.
- Remove the transport instruction that forced every review into the partial-diff
  rubric. The installed skill determines scope and confidence from actual coverage.
  Hosted test execution is never described as reviewer-local execution.

## Manual requests

For this repository, use the same queue instead of a second standalone review:

```bash
gh workflow run auto-pr-review.yml --repo PabloJVelez/private-chef-template \
  --ref main -f pr_number=25 -f dry_run=true
```

A requested public review uses `dry_run=false`. Follow queue admission through the
private draft or verified GitHub COMMENT; workflow success alone is not completion.
Same-head requests reuse a fresh ready draft or deduplicate an already published
v4 review. Do not erase ledger rows, edit ratings, or replay uncertain writes.
If bounded investigation cannot cover the task, report that and perform a clearly
identified supplemental investigation, not a silently different review pipeline.

No model tools, credentials in prompts, fallback models, shell access, production
execution, APPROVE, REQUEST_CHANGES, merge or deployment authority is added.
The model cannot run new tests; absent hosted execution remains a limitation.

## Validation and rollout

Run `python3 -m unittest discover -s .github/review -p 'test_*.py'`.
Coverage includes compact wiring changes, deferred changed-file recovery, literal
source searches, traversal rejection, head/digest/archive bounds, report failures
and skips, artifact fingerprint invalidation, adaptive-round accounting and
thread pagination, plus the existing provenance/publication/CI-retry regressions.

The real PR #25 replay at head `7d11dc33b9392f3b8082ab23b70e7c93b15a56dc`
and base `f53912525d0250f09d81b6cb4ddb445cbdf5ff3a` supplies all 20 changed
files and 25 related files without omissions. Source is 341,252 serialized bytes.
The full authenticated input was 428,612 bytes at replay time. Artifact
`13028318114` passed digest validation and supplies 394 passing tests, matching
head and unchanged parent row hashes, plus build/migration evidence. This is a
collector replay, not a model outcome or a prescribed rating.

Build and smoke-test the candidate with the existing restricted-runtime procedure,
then use an image-only rollout from the merged revision. Preserve workflow/skill/
model pins, credentials, queue and quarantine. `openclaw-v4` deliberately creates
new review identities without resetting history. Existing deliveries stay handled.
A fresh PR #25 dry run must prove the running image and model path without posting
another review. Record pushed, merged, upgraded and dry-run verified separately.
