# Automatic PR review Contents 404 (October 31, 2026)

The worker looked for the queue workflow in the **PR head**, where that file does
not exist. Both automatic deliveries deterministically fail at this request:

```text
GET https://api.github.com/repos/PabloJVelez/private-chef-template/contents/.github/workflows/auto-pr-review.yml?ref=9996f7e4ac7a9839fc0174c4317934950088cda3
HTTP 404
```

The installed worker's `poll()` uses Actions REST `run.head_sha` for this lookup,
then incorrectly requires it to equal the artifact's `workflow_sha`. For these
`pull_request_target` runs, REST identifies the PR head, while the workflow ran
from `main`. Changing only the lookup would therefore expose a second failure at
the old equality check. Successful Actions runs indicate queued requests, not
completed host reviews. No model invocation or review POST was reached for these
two deliveries.

## Sanitized evidence

The installed image's `runner.py` and `review.py` match repository commit
`590d1424c5ef06646d512c49ddd96b5afa337bb6`. Journal entries for `41154942673:1`
and `41154985985:1` report `API request failed with HTTP 404` at approximately
01:22:38 and 01:22:40 UTC. The historical journal did not record an endpoint;
the exact request above was reconstructed from the installed code and reproduced
with the same authenticated artifacts and existing worker token, using reads only.

All four runs have workflow ID `402257131`, repository ID `1106607031`, attempt 1,
status `completed`, conclusion `success`, and workflow path
`.github/workflows/auto-pr-review.yml`. All four downloaded ZIP digests were verified.

- Manual dry run [41150584333](https://github.com/PabloJVelez/private-chef-template/actions/runs/41150584333):
  artifact `13022488537`, `dry_run=true`, ledger `done`.
- Manual publication [41152345487](https://github.com/PabloJVelez/private-chef-template/actions/runs/41152345487):
  artifact `13023243349`, `dry_run=false`, ledger `done`.
- Automatic [41154942673](https://github.com/PabloJVelez/private-chef-template/actions/runs/41154942673):
  artifact `13024627894`, `dry_run=false`, ledger `failed`.
- Automatic [41154985985](https://github.com/PabloJVelez/private-chef-template/actions/runs/41154985985):
  artifact `13024807540`, `dry_run=false`, ledger `failed`.

Both manual runs are `workflow_dispatch` from branch `main`; REST `head_sha` and
artifact `workflow_sha` both equal `590d1424c5ef06646d512c49ddd96b5afa337bb6`.
Both automatic runs are `pull_request_target` on
`feat/meal-prep-v1-arrangements-approvals`; REST `head_sha` equals
`9996f7e4ac7a9839fc0174c4317934950088cda3`, while artifact `workflow_sha` still equals
`590d1424c5ef06646d512c49ddd96b5afa337bb6`. The reported synchronize/edited distinction
comes from the incident report: REST and the existing request schema retain the
event name, not its action subtype. The diagnosis does not depend on that subtype.

All requests target PR #20, `draft=false`, with base ref
`feat/meal-prep-v1-dated-offers-intake` and base SHA
`a973be19824f0d14cd8ed0f3a49fe29de181f810`. The manual requests review head
`1afa94aae1d540c4685a53ca6c3f4fb726e97f76`; automatic requests review its child
`9996f7e4ac7a9839fc0174c4317934950088cda3`. The PR base/head and run head repositories
are all `PabloJVelez/private-chef-template`; this incident involves no fork.

Sanitized workflow logs show the same `WORKFLOW_SHA` in every run, and identical
job-token permissions: **Metadata read and PullRequests read**. The workflow has
top-level `permissions: {}`, job-level `pull-requests: read`, and no checkout.
Its bytes match installed Git blob `17b0b8e5cb5df497e276f51ea4402fb7b540f18d`.
The job token and the host's dedicated fine-grained token are separate credentials.

Read checks with the **existing host token**, without printing credentials,
response bodies, signed URLs or raw logs, established:

- Run metadata, artifact metadata/downloads, PR metadata/reviews and Git objects
  are readable. The repository is public and its default branch is `main`.
- The exact failing Contents request returns 404 for both automatic deliveries.
  Contents at the actual workflow SHA returns 200 and the installed blob hash.
- Complete, non-truncated Git trees for the PR head and stacked base contain no
  queue workflow. The 404 is file absence, not an inferred permission problem.
- `GET commits/main` and the new historical `GET compare/{sha}...{main}` check work
  with the same token. The predecessor-to-main comparison returns `ahead` with
  the predecessor as merge base. No new token scope is needed.
- GraphQL `WorkflowRun.file.repositoryFileUrl` also uses the PR head for these
  automatic runs. It is not an independent source of the executed workflow SHA;
  the fix does not use it.

PR #20 is open at `9996f7e…`. It has exactly one
[COMMENT review](https://github.com/PabloJVelez/private-chef-template/pull/20#pullrequestreview-5720219843),
published by `PabloJVelez` at 00:52:21 UTC against `1afa94a…`. It does **not** cover
the current head. The ledger has one `published` review, with Astra/High metadata,
and no review entry for the new revision pair. Older failed deliveries remain
intact. No duplicate or replacement review was posted during this investigation.

## Fix and validation

Admission now binds automatic REST `head_sha` to artifact `head_sha`; manual runs
must identify `main` and match artifact `workflow_sha`. Before using an artifact
SHA in a URL, the worker validates it and all existing request/provenance fields.
It resolves `main` once and requires the workflow SHA to equal that commit or be
its ancestor, using authenticated GitHub comparison metadata. It reads the workflow
at that SHA and enforces the existing blob pin. Source lookup failures include the
fixed endpoint and validated SHA without exposing error bodies or credentials.

This relies on trusted default-branch workflow writers, authenticated run/artifact
provenance and the installed blob pin. Main ancestry is an independent restriction
on the artifact's claim, **not cryptographic proof of the executed workflow SHA**.
A main-history rewrite that removes the claimed commit fails closed. The change
does not admit fork head repositories previously rejected by the existing check.

Validation completed:

- 40 offline tests pass, including the real automatic/manual SHA relationships,
  main advancing after enqueue, wrong branches/revisions, unrelated history,
  changed workflow blobs, malformed SHAs, safe 404 context and poll-level claims.
  Existing model pin, credential isolation, stale-event, duplicate-publication,
  cached-draft and ambiguous-write/quarantine tests continue to pass.
- The new admission function accepts all four real artifacts using scoped read
  checks only. `process()`, model generation, publication and the live Store were
  never called by that check.
- The candidate image passed the actual installed OpenClaw CLI smoke test with
  the production invocation/parser, local fake provider, no tools, no host
  credentials and `--network none`. Live end-to-end automatic publication remains
  unverified until an explicitly approved deployment and subsequent event test.

The workflow, token permissions, private skill pin, Astra/High pin, runtime,
container isolation, publisher, policy key, ledger deduplication and quarantine
behavior are unchanged. No live service, deployment pointer, token, configuration,
ledger or auth store was modified.

## Safe rollout — not executed by this change

Do not run the initial `activate.py` installer or repeat the historical OAuth
recovery. Do not reset deliveries, edit review rows, remove quarantine, or rerun
either failed Actions run. This fix needs an **image-only upgrade** and no workflow
hash, skill, model-config or credential changes.

1. Obtain approval to merge the fix and separately authorize the worker upgrade.
   Use a clean checkout of the exact merged `main` on the host. Build and test a
   separate image; these commands do not access live queue/auth state:

   ```bash
   python3 -m unittest discover -s .github/review -p 'test_*.py' -v
   docker build -t openclaw-pr-review:event-source-fix -f .github/review/host/Dockerfile .github/review
   review_root="$HOME/.local/share/openclaw-pr-review"
   docker run --rm --network none --read-only --cap-drop ALL \
     --security-opt no-new-privileges --user "$(id -u):$(id -g)" \
     --pids-limit 128 --memory 2g --cpus 2 --log-driver none \
     --tmpfs /tmp:rw,nosuid,nodev,noexec,size=512m \
     --mount "type=bind,src=$review_root/runtime,dst=/opt/openclaw,readonly" \
     --mount "type=bind,src=$PWD/.github/review/host/smoke_runtime.py,dst=/smoke.py,readonly" \
     --entrypoint python3 openclaw-pr-review:event-source-fix /smoke.py
   ```

2. With explicit authorization for service interruption and resuming queue
   consumption, stop the service. Verify the installed workflow/skill pins and
   remote PR state, then change **only** the deployment image ID. The following
   guarded script preserves the old deployment pointer, opens the ledger read-only,
   and refuses unexpected incident delivery states. Any assertion failure means
   stop and investigate; do not clear state to make it pass.

   ```bash
   systemctl --user stop openclaw-pr-review.service
   python3 - <<'PY'
   import fcntl, importlib.util, json, os, sqlite3, subprocess
   from pathlib import Path
   os.umask(0o077)
   root = Path.home() / '.local/share/openclaw-pr-review'
   def run(*args):
       return subprocess.check_output(args, text=True).strip()
   assert run('systemctl', '--user', 'show', 'openclaw-pr-review.service',
              '-p', 'ActiveState', '--value') == 'inactive'
   lock = (root / 'state/worker.lock').open('rb')
   fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
   spec = importlib.util.spec_from_file_location('runner', '.github/review/runner.py')
   r = importlib.util.module_from_spec(spec); spec.loader.exec_module(r)
   config = json.loads((root / 'credentials/config.json').read_text())
   r.load_skill(root / 'skill', config['skill_sha256'])
   assert r.git_blob(Path('.github/workflows/auto-pr-review.yml').read_bytes()) == config['workflow_blob']
   api = r.review.GitHub(r.REPOSITORY, (root / 'credentials/github-token').read_text().strip())
   assert run('git', 'status', '--porcelain') == ''
   assert run('git', 'rev-parse', 'HEAD') == api.get('commits/main')['sha']
   pr = api.get('pulls/20')
   assert pr['state'] == 'open' and not pr['draft']
   assert pr['base']['sha'] == 'a973be19824f0d14cd8ed0f3a49fe29de181f810'
   assert pr['head']['sha'] == '9996f7e4ac7a9839fc0174c4317934950088cda3'
   assert pr['base']['ref'] == 'feat/meal-prep-v1-dated-offers-intake'
   reviews = api.pages('pulls/20/reviews')
   assert [(x['id'], x['state'], x['commit_id']) for x in reviews] == [
       (5720219843, 'COMMENTED', '1afa94aae1d540c4685a53ca6c3f4fb726e97f76')], 'Remote reviews changed; inspect'
   db = sqlite3.connect(f'file:{root}/state/queue.sqlite?mode=ro', uri=True)
   for delivery in ('41154942673:1', '41154985985:1'):
       assert db.execute('SELECT status FROM deliveries WHERE id=?', (delivery,)).fetchone() == ('failed',)
   db.close()
   old = (root / 'deployment.json').read_text()
   deployment = json.loads(old)
   image = run('docker', 'image', 'inspect', 'openclaw-pr-review:event-source-fix', '--format', '{{.Id}}')
   assert image.startswith('sha256:') and image != deployment['image_id']
   with (root / 'deployment.before-event-source-fix.json').open('x') as backup:
       backup.write(old)
   deployment['image_id'] = image
   staged = root / 'deployment.event-source-fix.next.json'
   with staged.open('x') as output:
       json.dump(deployment, output)
   staged.replace(root / 'deployment.json')
   print('Image pointer updated; credentials, config, skill and ledger preserved.')
   PY
   ```

3. After the guarded update succeeds, start the service:
   `systemctl --user start openclaw-pr-review.service`. This resumes normal queue
   consumption; it is not a dry run. The two failed deliveries stay claimed and
   cannot replay. Inspect only sanitized status messages. If startup fails, stop
   the service and inspect it. Under the same service lock, the saved deployment
   pointer can restore the old image; it restores the known automatic-admission
   bug too. Never restore or replace the ledger as part of image rollback.

4. Obtain separate authorization before generating any verification event. For
   PR #20, recheck the current revisions and remote reviews, then dispatch **one
   new dry run** with `gh workflow run auto-pr-review.yml --repo
   PabloJVelez/private-chef-template --ref main -f pr_number=20 -f dry_run=true`.
   Inspect the resulting private draft and its Astra/High metadata. Publication
   requires separate authorization and one new `dry_run=false` dispatch after
   another freshness/duplicate check. A changed PR requires fresh investigation,
   not relaxing the assertions above. Any quarantine remains an operator issue.
   Verify real automatic routing on an explicitly authorized disposable PR;
   do not edit, retarget or push to PR #20 merely to generate a test event.

The minimum next operator action is approval of the fix's merge and the image-only
upgrade. No permission expansion, token replacement or ledger repair is needed.
