# Automatic PR review

One GitHub Actions workflow, GitHub-hosted runners, the built-in `GITHUB_TOKEN`,
and one OpenAI API key. No GitHub Apps, PATs, OpenClaw gateway, self-hosted runner,
package installs or production access are required.

**Not active until the infrastructure PR is merged into `main`, the key is set,
and the live dispatch/event tests below pass.** Existing PRs do not receive a
retroactive event when this workflow is installed.

## Finish setup

The `pr-review` GitHub environment has been created with a custom branch policy
allowing only the branch `main`. It has no required reviewer or wait timer.
The workflow uses `deployment: false`, so reviews do not create deployments.
Keep the key in this environment, not in repository-wide Actions secrets:
same-repository PR workflows could otherwise read it.

The only missing credential is a budget-limited OpenAI project API key with
Responses API access. Enter it privately at the prompt; do not paste it into chat:

```bash
gh secret set OPENAI_API_KEY --repo PabloJVelez/private-chef-template --env pr-review
```

The default model is `gpt-5.4-mini-2026-03-17`. If your account requires another
Responses-compatible text model, set environment variable `PR_REVIEW_MODEL` in
the GitHub environment's **Variables** settings. Account access cannot be
verified without the key. Configure the provider's spend controls/alerts: public
PR activity can incur model cost. Each run makes at most one model request with
bounded input and 6,000 maximum output tokens; there is no automatic API retry.

A maintainer then merges the infrastructure PR into `main`. This implementation
does not merge anything or change branch protections. Keep `main` and its review
workflow under trusted maintainer control. No Meal Prep branch needs an edit.

## Test PR #20 after installation

First generate a review without posting:

```bash
gh workflow run auto-pr-review.yml --repo PabloJVelez/private-chef-template \
  --ref main -f pr_number=20 -f dry_run=true
gh run list --repo PabloJVelez/private-chef-template --workflow auto-pr-review.yml --limit 5
```

Inspect the successful run's `pr-review-result` artifact (`result.json`), including
the base/head SHAs and review quality. PR #20 is stacked: its base is
`feat/meal-prep-v1-dated-offers-intake`, not `main`. The workflow resolves its live
base each time. Then publish through the same guarded workflow:

```bash
gh workflow run auto-pr-review.yml --repo PabloJVelez/private-chef-template \
  --ref main -f pr_number=20 -f dry_run=false
```

Confirm a `github-actions[bot]` **COMMENT** review with the recorded head commit,
base SHA, and workflow-run link. Dispatch again and confirm it skips the duplicate.
The repository's “Allow GitHub Actions to create and approve pull requests” option
need not be enabled: the publisher does not create PRs or submit APPROVE reviews.
An API/policy error fails the job explicitly; do not broaden permissions blindly.

Finally verify a real opened or synchronize event on a disposable PR, and a fork
PR if external contributions are used. Manual dispatch proves generation and
publication; it does not by itself prove automatic event routing. Do not call the
integration active until the default-branch automatic trigger is also verified.
No live model call, hosted publication or dispatch was possible before installation.

## How it works

- `pull_request_target` runs trusted default-branch workflow code on opened,
  synchronize, reopened, ready-for-review and edited events. There are no path,
  base-branch, author, bot or draft exclusions. Edited events handle retargeting;
  same-revision metadata edits deduplicate. Manual dispatch must use `main`.
- Both jobs check out only the trusted `github.workflow_sha`, with persisted
  credentials disabled. All third-party Actions are pinned to commit SHAs.
- Preparation has read-only permissions. It reads PR metadata, feedback and
  head-commit checks, then fetches exact revisions into a temporary **bare Git
  repository**. PR objects never become a working tree. The fetch is anonymous
  because this repository is public; private forks of this template need a
  separately reviewed authenticated-fetch implementation.
- The diff is `merge-base(actual base SHA, head SHA)..head SHA`, preserving stacked
  PR scope. Base guidance comes from the actual base SHA. Regular blobs become JSON
  data; symlinks/submodules are not followed. Git hooks, external diff and textconv
  are disabled. PR scripts, filters, dependencies and tests never run with secrets.
- A separate step sends evidence to OpenAI Responses with `tools: []` and
  `store: false`. The key is an HTTP authentication header, never prompt text.
  There is no agent runtime or tool executor. The model cannot read runner files,
  execute commands, fetch URLs, access GitHub or obtain environment credentials.
- A fresh publisher job gets only a bounded JSON result from this run's artifact
  ID. It has `pull-requests: write` and `contents: read` for its trusted helper;
  no model key. It rechecks the PR state, draft status, head, base SHA and base ref
  immediately before posting a COMMENT tied to the reviewed head. It cannot push
  commits, approve, request changes, resolve threads or merge.
- A per-PR workflow concurrency group covers both jobs. A marker covering the
  repository, PR, revisions, base ref, draft state and policy version suppresses
  duplicates from `github-actions[bot]`. User-authored markers do not count. An
  ambiguous write is reconciled by reading reviews once; POST is never retried.
  Deduplication is operational, not a security boundary against trusted repository
  writers who can use the shared Actions bot identity in other workflows.
- Only final review text and revision metadata are uploaded, retained for three
  days. Source bundles, API keys and HTTP response bodies are not logged/uploaded.
  Review/comment events are not triggers, so publication cannot loop.

The existing private OpenClaw `pr-review` skill informed the review criteria:
pin revisions, establish evidence, check consequential defects and simplicity,
reconcile feedback, disclose gaps, and state merge confidence. This is a small,
tool-free adaptation, **not an invocation of that skill**. Its private files and
host OAuth credentials are not copied to this public repository. Running the exact
private skill would require more runtime and private-repository access; neither is
needed for this implementation.

## Coverage and operational limits

Reviews are explicitly **partial**. Input includes changed-file patches and source,
base `AGENTS.md`/`REVIEW.md` guidance, discussion, prior reviews and reported CI.
Unchanged consumers, linked requirements and resolved-thread state are not fully
available. Files over 32 KB, binary/non-UTF-8 files, symlinks and submodules are
marked omitted. Source context is budgeted to 300 KB; oversized discussion sections
are omitted with a limitation. More than 3,000 changed paths fail explicitly.
The model's absence of findings is never proof a change is safe to merge.

Freshness checks cannot be atomic with GitHub's review write; the review always
states its pinned revisions. Base-only pushes do not emit a PR synchronize event:
dispatch manually after such movement if no PR event follows. GitHub may suppress
certain SHA-like branch names, Actions-token-generated events, or runs under its
own security/billing policies. These platform limits also require manual dispatch.
Missing keys, provider failures and stale fetches are visible run failures, not
successful clean reviews. Pending events may coalesce under concurrency.

Prompt injection can affect review prose even though it cannot execute code or
retrieve secrets. Repository source and discussions are sent to the configured
model provider. `store: false` disables response storage, not every provider data
retention policy. Use a suitable API project and treat findings as advisory.

Disable via **Actions → Automatic PR review → Disable workflow**, or
`gh workflow disable auto-pr-review.yml --repo PabloJVelez/private-chef-template`.
Remove the environment key to revoke model access.

## Validation

```bash
python3 -m unittest discover -s .github/review -p 'test_*.py' -v
actionlint .github/workflows/auto-pr-review.yml .github/workflows/auto-pr-review-tests.yml
```

The unprivileged helper-test workflow exercises Git fixtures, fork/stack targeting,
stale snapshots, hostile filenames, symlinks, binary/large files, context limits,
pagination, credential canaries, model refusal/tool output, deduplication and
uncertain publication. It has no environment or model credential access.

References: [GitHub event semantics](https://docs.github.com/en/actions/reference/workflows-and-actions/events-that-trigger-workflows#pull_request_target),
[safe use of pull_request_target](https://docs.github.com/en/actions/reference/security/securely-using-pull_request_target),
[environment syntax](https://docs.github.com/en/actions/reference/workflows-and-actions/workflow-syntax#jobsjob_idenvironment),
[OpenAI Responses API](https://developers.openai.com/api/reference/resources/responses/methods/create).
