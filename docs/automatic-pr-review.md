# Automatic OpenClaw PR review

PR #21 replaces its separate OpenAI Responses reviewer with the **existing installed
OpenClaw `pr-review` skill**. The worker reads `SKILL.md` and
`references/inspection-lenses.md` verbatim from the operator's private installation.
There is no second review prompt, model API client, or public copy of the skill.
The Python code only transports events, supplies evidence, and publishes the result.

**Manual publication verified; automatic event admission needs an upgrade.** The
OAuth/Astra fix was installed and PR #20's October 31 manual dry run and publication
succeeded. Automatic deliveries then failed because the worker confused the PR
head with the workflow source SHA. See the [404 diagnosis and image-only rollout](pr-review-event-404.md).
The earlier [OAuth recovery](pr-review-oauth-recovery.md) is historical; do not repeat
its ledger reconciliation or model-config changes for this incident.

**Evidence/CI follow-up:** [coverage and CI scheduling fix](pr-review-evidence-ci.md)
removes duplicated source, includes bounded related files and completed hosted
verification metadata, and defers generation while checks run. It requires an
image-only worker upgrade after merge; pushing the fix does not activate it.

## Design and boundaries

1. GitHub-hosted Actions handles `opened`, `synchronize`, `reopened`,
   `ready_for_review`, and `edited` (retargeting), plus manual dispatch. It writes
   a small `request.json` artifact with repository/PR identity, exact base/head
   SHAs, base ref, draft state, workflow SHA and run attempt. It has only PR-read
   permission, no checkout, model credential, webhook secret or host connection.
2. A dedicated container on the existing OpenClaw host polls GitHub's authenticated
   artifact queue every two minutes. No public endpoint, tunnel, self-hosted Actions
   registration, new server, or inbound firewall change is required. A successful
   workflow means **queued**, not reviewed; host logs track completion/failure.
3. Before accepting an artifact, the worker checks repository IDs, workflow ID/path,
   successful event type, activation timestamp, run attempt, workflow commit in
   authenticated `main` history, exact installed workflow Git blob at the artifact's
   workflow SHA, artifact name/size/digest and request identity. Signed
   artifact redirects never receive the GitHub credential. ZIP members are read as
   bounded data, never extracted. Fork `pull_request` test artifacts cannot enter
   this queue. Dispatch from any branch other than `main` is rejected.
4. The worker rechecks the live PR against the event snapshot, then uses a temporary
   bare Git repository to read blobs. The diff is
   `merge-base(actual base SHA, head SHA)..head SHA`, including stacked PRs whose base
   is another feature branch. Base guidance comes from the actual pinned base.
   No PR checkout, filters, hooks, package installs, scripts, tests or submodules run.
5. `openclaw agent --local --session-id … --message-file … --model openai/gpt-6-astra
   --thinking high --timeout 600 --json` runs the existing skill with the evidence.
   All reviews require **GPT-6 Astra / High**, with no silent model fallback.
   Cached results from another model or reasoning setting cannot be published.
   Each invocation gets a fresh session, private temporary agent state/workspace,
   and a pinned `OPENCLAW_CONFIG_PATH`; bootstrap and login-shell import are disabled.
   Only its shared-state directory links to the existing mounted auth store.
   OpenClaw 2026.9.7's `agent exec` scopes shared auth to static credentials and
   excludes OAuth, so it is unsuitable for this installation.
   The pinned config explicitly chooses OpenClaw's built-in runtime, disables all
   tools (`deny: ["*"]`), Code Mode and browser, allows only the OpenAI provider
   plugin, and has no model or cyber-escalation fallback. Activation pins auth ordering to the
   existing OAuth profile only; the unactivated template selects no auth profiles. The skill's supplied-diff/partial-review
   behavior applies because independent tool investigation is unavailable. Publication
   transport is delegated to the deterministic controller, not to a model tool.
6. The publisher checks the current state/base/head/base ref/draft again and submits
   **COMMENT**, tied to the reviewed head. It never approves, requests changes,
   pushes, resolves threads or merges. The review includes scope, findings,
   reconciliation, verification gaps, recommendation and the skill's required
   `Merge confidence: X/10`. Generation fails if the confidence rating is absent.

`pull_request_target` executes the **default-branch workflow**, including for stacked
PRs, but Actions REST `head_sha` identifies the **PR head** in the observed runs.
The artifact records `github.workflow_sha` separately. The consumer binds REST
`head_sha` to the requested PR head for automatic events, and to the workflow SHA
for dispatches from `main`. It verifies that the workflow SHA is in authenticated
`main` history and that its file matches the installed blob pin. Default-branch
workflow writers are trusted; this is not a signed execution attestation. A source
removed by a force-push fails closed. Existing source-repository checks remain;
fork routing has not been verified. There are no author, draft, bot, base or path exclusions.

## Host isolation and authentication

The worker is a non-root Docker container, with a read-only root filesystem, all
Linux capabilities dropped, no privilege escalation, default seccomp/AppArmor,
private temporary storage, and CPU/memory/PID limits. Its immutable image is pinned
by local image ID; the Node base image is pinned by digest. Activation snapshots the
already installed OpenClaw 2026.9.7 runtime and private skill locally and mounts them
read-only. It never installs dependencies from a PR. Skill content is hash-pinned;
changes require operator review and a deliberate reinstall/repin.

The container has no host project directories, SSH keys, gateway configuration,
agent history, browser profiles, Docker socket, host PID/network namespace, or
production deployment access. Its only writable host mounts are its private queue
state and OpenClaw's existing **shared auth store directory**. The latter is necessary
for supported SQLite locking and OAuth refresh; it is sensitive trusted runtime
access, not a promise that the process contains no credentials. No untrusted PR
code runs in that process, and the model has no filesystem, shell, HTTP, messaging,
subagent or other tools. This boundary relies on the pinned trusted OpenClaw runtime
and tool policy; prompt instructions alone are not the security control.

The model subprocess receives an explicit minimal environment without GitHub tokens,
API keys or ambient CLI settings. The controller reads its GitHub token from a
private mounted file. The trusted runtime can read the shared model auth store;
neither credential is put in the prompt. Source/discussion can still influence
review prose and is sent to the model provider, so reviews remain advisory.

Host inspection found a usable OpenAI OAuth profile in the shared SQLite store,
with no OpenAI API-key profile. OpenClaw documents the built-in runtime's supported
OAuth transport. Reusing that store avoids copying refresh tokens or making a
second login compete with the existing host. A credential-readiness check inside the restricted container also found the shared
OAuth profile with networking disabled and the auth store mounted read-only. A restricted local invocation with an unexpired, access-only OAuth credential
in disposable state has succeeded with the configured model. The production auth
store was mounted read-only and no refresh token was copied. Token expiry,
subscription limits or provider policy can still block later generation. There is no silent fallback to separately billed API
credentials. Existing hosting is reused, but **zero model/API charges are not
verified**; subscription usage/paid credits and GitHub Actions quotas still apply.

## One host activation action, after merge

From a clean checkout of the exact merged `main` commit on the existing host, run:

```bash
python3 .github/review/host/activate.py
```

The command prompts privately for a **fine-grained GitHub PAT** restricted to
`PabloJVelez/private-chef-template`, with:

- Actions: read (queue run/artifact metadata and downloads).
- Contents: read (trusted workflow identity; Git fetch itself is public/anonymous).
- Pull requests: write (metadata, discussion, and COMMENT reviews).
- Checks and Commit statuses: read for CI evidence; unavailable CI is disclosed.
- Metadata: read (GitHub's required default).

Use a dedicated bot/account if a distinct review identity is desired. Reviews are
posted as the PAT owner, **not** `github-actions[bot]`. The owner must be allowed to
review the repository. Do not reuse the host's broad `gh` credential, add write
access to contents, or grant administration permission. GitHub's permission model
cannot restrict PR-write tokens to COMMENT alone; the fixed publisher enforces that
state. Never paste the token into chat. Token creation/approval is the only new
credential prerequisite; no webhook or model API secret is needed.

Activation verifies repository/workflow identity against merged `main`, reruns tests
and a credential-free real-runtime smoke test, copies the existing runtime/skill,
writes private files under `~/.local/share/openclaw-pr-review`, and enables
`openclaw-pr-review.service` with user systemd. It refuses an existing installation
rather than overwriting it. Docker and user-service lingering were verified on this
host (`Linger=yes`); no sudo or added hosting is needed here. OAuth is reused only
through the supported OpenClaw shared store. Do not run this initial installer to upgrade an existing installation; use the
explicit recovery steps linked above after approval.

The old `OPENAI_API_KEY` / `PR_REVIEW_MODEL` workflow settings are no longer used.
The earlier `pr-review` GitHub environment is not required by this implementation.

## Verify before calling it active

After activation, request an existing stacked PR as a dry run:

```bash
gh workflow run auto-pr-review.yml --repo PabloJVelez/private-chef-template \
  --ref main -f pr_number=20 -f dry_run=true
journalctl --user -u openclaw-pr-review.service --since '10 minutes ago'
```

The completed draft is retained privately in the `reviews.result` JSON column of
`~/.local/share/openclaw-pr-review/state/queue.sqlite`. Inspect it locally (do not
upload the database, which contains private review text). Confirm actual base/head,
partial coverage, findings, and confidence. Then dispatch with `dry_run=false`.
The worker reuses the completed output and rechecks freshness before posting.
Confirm the COMMENT's URL, author and commit, then dispatch again to verify no
second review and no second model invocation for that revision pair.

Finally open/update a **disposable PR**, verify the automatic workflow and host
completion, and repeat with a fork if external contributions are used. Test a
stacked base too. Manual dispatch does not prove event routing. Do not change any
Meal Prep branch to generate a test event. Existing PRs receive no retrospective
open event after installation; use manual dispatch.

## Deduplication, recovery and operating limits

The queue persists run-ID/attempt claims before work. A process lock enforces a
single consumer. Reviews deduplicate by repository, PR, exact base/head, base ref,
draft state, policy version and installed skill hash, using both a durable ledger
and remote reviews from the configured numeric GitHub actor ID. Contributor-authored
markers do not suppress reviews. A maximum of 20 revision pairs per UTC day bounds
model use; no automatic retry of model failures or quota-denied deliveries occurs.
Dispatch again after addressing the cause. Anyone trusted to use the publisher's
GitHub identity could forge its marker; this is not an identity security boundary.

A completed dry-run result survives restarts. Before publishing, the worker saves
`publishing`; after an ambiguous failure it checks remote reviews once and never
blindly retries POST. `started`, `publishing`, or `uncertain` ledger entries left by
failures/crashes are quarantined. An operator must stop the service, inspect the
matching remote review and local result, and reconcile that entry before rerunning;
do not delete the ledger or blindly retry a possibly accepted write. Ordinary
transport failures before generation can use a new manual workflow dispatch.

The queue retains request artifacts for seven days and scans the most recent six,
starting at activation. Longer outages require manual dispatch. Workflow-file
changes intentionally stop admission until the operator updates the installed
workflow hash after reviewing the change. An installation upgrade should preserve
the private state/ledger, rotate or retain the scoped token deliberately, and
re-run isolated tests before restarting. Never mount a live working tree as code.

Evidence is bounded: up to 3,000 changed paths, 32 KB per regular text file, 300 KB
source context, and 40 KB per discussion category. Binary/large files, symlinks,
submodules, missing unchanged consumers, inaccessible requirements and resolved
thread state are disclosed. PR tests are never run. Review output is bounded to
40 KB. Freshness checks cannot be atomic with GitHub's review write; pinned SHAs
always identify what was actually reviewed. Base-only pushes need manual dispatch
if no PR event follows. GitHub can suppress Actions-token-generated events and
certain branch names. No comment/review event triggers this workflow.

Monitor the host journal as well as Actions. Stop with
`systemctl --user disable --now openclaw-pr-review.service`; disable the queue with
`gh workflow disable auto-pr-review.yml --repo PabloJVelez/private-chef-template`.
Revoke the dedicated PAT to remove publication/queue access. Do not revoke the
shared OAuth login just to disable this worker; other host agents use it.

## Validation and references

```bash
python3 -m unittest discover -s .github/review -p 'test_*.py' -v
actionlint .github/workflows/auto-pr-review.yml .github/workflows/auto-pr-review-tests.yml
```

Offline tests cover real stacked Git fixtures, hostile paths, unsafe object types,
source bounds, queue provenance, skill drift, credential canaries, parser failures,
stale events, deduplication, draft reuse and crash/ambiguous-write quarantine. The
host smoke test runs the **actual installed OpenClaw CLI and production invocation/parser** against a local fake
provider inside the restricted container with `--network none`, verifies no tool
definitions were sent, and mounts no host credentials. This is runtime/isolation
evidence, not proof of live provider access, billing, publication or event routing.

References: [OpenClaw local agent CLI](https://docs.openclaw.ai/cli/agent),
[OpenClaw OAuth/shared store](https://docs.openclaw.ai/concepts/oauth),
[OpenClaw runtime policy](https://docs.openclaw.ai/concepts/agent-runtimes),
[GitHub event semantics](https://docs.github.com/en/actions/reference/workflows-and-actions/events-that-trigger-workflows#pull_request_target),
[OpenAI authentication](https://developers.openai.com/codex/auth),
[OpenAI subscription usage and pricing](https://developers.openai.com/codex/pricing).
