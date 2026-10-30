# PR review OAuth generation failure and recovery

## Diagnosis (October 30, 2026)

Both Actions runs only queued requests; their success did not indicate a completed
review. Authenticated artifact validation confirmed the following for PR #20:

- Dry run `41133858116:1`: `dry_run=true`; generation failed.
- Publication `41133949190:1`: `dry_run=false`; consumed and failed at the existing
  quarantine gate, before generation or publication.
- Both pinned base `a973be19824f0d14cd8ed0f3a49fe29de181f810`, head
  `1afa94aae1d540c4685a53ca6c3f4fb726e97f76`, and base ref
  `feat/meal-prep-v1-dated-offers-intake`.
- The private ledger has both deliveries marked `failed`, one review marked
  `started`, and no stored result. GitHub returned no reviews for PR #20.

The retained private runtime diagnostic, reduced to its fixed error message, was:
`Explicit auth order for openai has no usable profiles.` No raw logs or credentials
are included here.

This is a runtime/auth-scope mismatch, not evidence of an expired login or a missing
model. In the installed OpenClaw 2026.9.7 runtime, `agent exec` enters
`withAuthProfileStoreAgentDir`; `prepareScopedSharedAuthProfileStore` retains only
credentials whose portability reason is `portable-static-credential`. Shared OAuth
is excluded. The worker's explicit OAuth-only order therefore has no usable profile
inside that scope, even though `models status` outside the scope reports OAuth `ok`
and `models list` reports `openai/gpt-5.6-sol` available.

The fix uses the supported `agent --local` path and pins **`openai/gpt-6-astra`
with `--thinking high`**, as required for all automatic reviews. The installed
OpenAI plugin catalog identifies this exact model; the restricted runtime reports
it available and an authenticated live probe succeeded. Official
[GPT-6 Astra documentation](https://developers.openai.com/api/docs/models/gpt-6-astra)
confirms High reasoning support. The earlier `gpt-5.6-sol` probe was diagnostic only.

The built-in runtime, OAuth-only order, no fallbacks, no tools, disabled browser/Code Mode, and the
same installed skill bytes as the sole review policy are preserved. It creates fresh temporary
agent/session/workspace state and pins config via `OPENCLAW_CONFIG_PATH`. Only the
shared auth-store directory is linked into that state. It validates the local
result's terminal state, model identity, error flags, tool activity, review size,
and confidence before accepting final prose. Config drift to another primary,
fallback chain, or runtime fails closed. Cached results must record Astra / High
before they can be published; old results are not silently reused or regenerated. Local JSON includes prompt diagnostics;
its bounded envelope is discarded, and only final review text is retained privately.

No runtime files or security controls were patched. The production container,
service, credentials, config, and queue ledger were not changed during investigation.
The existing `started` quarantine remains intentionally intact. There is no evidence
of an attempted review POST for these two deliveries, but quarantine is not lifted
automatically: an operator must recheck remote state before reconciliation.

## Validation and limits

- 32 offline boundary/recovery tests, including failure flags, model mismatch,
  reasoning/commentary exclusion, secret canaries, and quarantine preservation.
- Actual pinned runtime and production invocation/parser against a fake local
  provider in the restricted container, with `--network none`, no host credentials,
  and captured requests confirming no tool definitions and High reasoning.
- A minimal live model probe succeeded with `openai/gpt-6-astra`, High reasoning,
  and tools denied.
  The live store was read-only. Only the selected unexpired access credential and
  necessary account metadata entered disposable container state; the refresh token
  was omitted. This did not rotate or write production credentials.
- Controlled PR #20 dry run passed with `openai/gpt-6-astra` / `high`: private
  ledger state `ready`, 3,108 bytes of final review, and a valid merge-confidence
  rating. It used authenticated pinned evidence, the unchanged private skill,
  disposable state, and an API adapter that refuses publication. No GitHub token
  or production queue was mounted in the model test container. The final draft
  remains private and cannot release the production quarantine.

A read-only-store `agent --local` probe failed on a SQLite write before inference;
local runtime state must be writable. The disposable credential test above supplies
that state without writing the live database. Production already mounts its shared
store writable for supported SQLite operations and OAuth refresh; this fix does not
add a new host mount. The shared database is not an auth-only file: local execution
can also write runtime registry/health bookkeeping there. Production OAuth refresh, real publication, and
real automatic PR-event completion remain unverified. **End-to-end automation is
not operational until the approved upgrade and subsequent verification succeed.**

## Minimal activation, only after explicit operator approval and merge

These steps are **not executed by this PR**. Do not run `activate.py` over the existing
installation. Do not clear the ledger, replay the publication dispatch, or copy the
local test's result into production. No OAuth login or token replacement is required.

1. From a clean checkout of the approved fix merged to `main`, run the offline tests,
   build a separate image, and run the credential-free smoke test. This does not
   change the running worker:

   ```bash
   python3 -m unittest discover -s .github/review -p 'test_*.py'
   docker build -t openclaw-pr-review:oauth-fix -f .github/review/host/Dockerfile .github/review
   review_root="$HOME/.local/share/openclaw-pr-review"
   docker run --rm --network none --read-only --cap-drop ALL \
     --security-opt no-new-privileges --user "$(id -u):$(id -g)" \
     --pids-limit 128 --memory 2g --cpus 2 --log-driver none \
     --tmpfs /tmp:rw,nosuid,nodev,noexec,size=512m \
     --mount "type=bind,src=$review_root/runtime,dst=/opt/openclaw,readonly" \
     --mount "type=bind,src=$PWD/.github/review/host/smoke_runtime.py,dst=/smoke.py,readonly" \
     --entrypoint python3 openclaw-pr-review:oauth-fix /smoke.py
   ```

2. With approval for the service interruption, model-config update, and targeted
   reconciliation, stop the
   service, then execute the following guarded upgrade from that checkout. It uses
   the existing scoped GitHub token for reads only, verifies the live PR and remote
   review absence, backs up the ledger, and changes only the known `started` row to
   `generation_failed`. It preserves both failed delivery rows and all other ledger
   entries. Any unexpected state aborts; leave the service stopped and inspect it.
   It never resets `publishing` or `uncertain` rows. It pins the new image and updates
   only the model/runtime fields in the installed OpenClaw config, retaining the
   exact OAuth profile order and all security settings. No secret is replaced.

   ```bash
   systemctl --user stop openclaw-pr-review.service
   python3 - <<'PY'
   import fcntl, importlib.util, json, os, shutil, sqlite3, subprocess
   from pathlib import Path
   os.umask(0o077)
   root = Path.home() / '.local/share/openclaw-pr-review'
   assert subprocess.check_output(['systemctl', '--user', 'show',
       'openclaw-pr-review.service', '-p', 'ActiveState', '--value'], text=True).strip() == 'inactive'
   lock = (root / 'state/worker.lock').open('a')
   fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
   spec = importlib.util.spec_from_file_location('runner', '.github/review/runner.py')
   r = importlib.util.module_from_spec(spec); spec.loader.exec_module(r)
   config = json.loads((root / 'credentials/config.json').read_text())
   r.load_skill(root / 'skill', config['skill_sha256'])
   r.review.POLICY += '-' + config['skill_sha256'][:16]
   api = r.review.GitHub(r.REPOSITORY, (root / 'credentials/github-token').read_text().strip())
   pr = api.get('pulls/20')
   contract = r.review.identity(pr, api.repository)
   assert pr['state'] == 'open' and not pr['draft']
   assert contract['base_sha'] == 'a973be19824f0d14cd8ed0f3a49fe29de181f810'
   assert contract['head_sha'] == '1afa94aae1d540c4685a53ca6c3f4fb726e97f76'
   assert contract['base_ref'] == 'feat/meal-prep-v1-dated-offers-intake'
   assert not api.pages('pulls/20/reviews'), 'Remote reviews changed; inspect before proceeding'
   db = sqlite3.connect(root / 'state/queue.sqlite')
   key = r.review.marker(contract)
   assert db.execute('SELECT status,result FROM reviews WHERE id=?', (key,)).fetchone() == ('started', None)
   for delivery in ('41133858116:1', '41133949190:1'):
       assert db.execute('SELECT status FROM deliveries WHERE id=?', (delivery,)).fetchone() == ('failed',)
   backup = root / 'state/queue.before-oauth-fix.sqlite'
   deployment_backup = root / 'deployment.before-oauth-fix.json'
   model_backup = root / 'openclaw-config.before-oauth-fix.json'
   assert not any(p.exists() for p in (backup, deployment_backup, model_backup)), 'Preserve existing recovery backups'
   model_path = root / 'credentials/openclaw.json'
   model_config = json.loads(model_path.read_text())
   model_config['agents']['defaults']['model'] = {'primary': r.MODEL, 'fallbacks': []}
   model_config['agents']['defaults']['models'] = {r.MODEL: {'agentRuntime': {'id': 'openclaw'}}}
   with sqlite3.connect(backup) as dest:
       db.backup(dest)
   shutil.copyfile(root / 'deployment.json', deployment_backup)
   shutil.copyfile(model_path, model_backup)
   image = subprocess.check_output(['docker', 'image', 'inspect',
       'openclaw-pr-review:oauth-fix', '--format', '{{.Id}}'], text=True).strip()
   assert image.startswith('sha256:')
   with db:
       changed = db.execute("UPDATE reviews SET status='generation_failed' WHERE id=? AND status='started' AND result IS NULL", (key,))
       assert changed.rowcount == 1
   db.close()
   deployment = json.loads((root / 'deployment.json').read_text())
   deployment['image_id'] = image
   staged = root / 'deployment.next.json'
   staged.write_text(json.dumps(deployment))
   staged.replace(root / 'deployment.json')
   staged_model = root / 'credentials/openclaw.next.json'
   staged_model.write_text(json.dumps(model_config))
   staged_model.replace(model_path)
   print('Image and Astra config pinned; one generation-only quarantine reconciled; secrets and deliveries preserved.')
   PY
   ```

3. Only after the guarded step succeeds, start the service:
   `systemctl --user start openclaw-pr-review.service`. The existing launcher, unit,
   OAuth ordering, workflow pin, private skill, and credentials remain unchanged.
   The new runner supplies bootstrap/shell-import settings in its temporary config;
   the approved installed config change is limited to the model/runtime pin.

4. Dispatch **one new dry run**, inspect its private `ready` result, and recheck
   freshness. The two old deliveries stay claimed/failed and are not replayed:

   ```bash
   gh workflow run auto-pr-review.yml --repo PabloJVelez/private-chef-template \
     --ref main -f pr_number=20 -f dry_run=true
   ```

   Publication is a separate deliberate action after inspecting that result. Do not
   rerun the old publication request. Verify one COMMENT pinned to the expected head,
   then deduplication and a real automatic event before declaring the system operational.
   If another `started`/`publishing`/`uncertain` entry appears, inspect it rather than
   repeating reconciliation. If activation fails, leave the service stopped. Restoring
   the old image/config would restore the broken Sol setup and does not meet the Astra
   requirement; do not resume it as an automatic-review fallback. Keep the backups
   for inspection, and never restore an old queue database over newer ledger state.
