# Trusted PR preview controller

`controller.py` is an operator-installed reconciler, separate from PR code.
Copy its reviewed version, `managed-compose.yaml`, `nginx.conf`, and
`browser-acceptance.cjs` into a private release directory. Never auto-pull a PR
checkout or execute PR-supplied shell, Compose, deploy or teardown scripts on
the NUC. Image builds run on GitHub-hosted workers without deployment secrets.

## Lifecycle

- Non-draft, same-repository PRs with write/maintain/admin authors qualify.
  Forks are excluded. `only_prs` in operator config supports bounded rollout.
- New commits build exact-head backend/storefront artifacts. A newest failed or
  pending build cannot fall back to an earlier successful build. Checksums and
  image revision labels are checked; runtime uses immutable local image IDs.
- Existing occupants keep slots; oldest successfully built PRs fill vacancies.
  At most two stacks. No-build PRs cannot starve later successfully built PRs.
- Private per-PR passwords, databases, uploads, Redis, ports and networks.
  An operator lock serializes reconciliations. Stale/current-head guards run
  before import, migrations, route publication and ready comments.
- Stop apps and withdraw routes before migrations. Snapshot the existing DB,
  preserve env, run one migration and additive seed, then start app and proxy.
  Failed migrations stay stopped with data intact. No automatic down-migration.
- Require normal public DNS/TLS, API auth/CORS/seed/availability/rendered pages,
  fresh public upload/download and real browser/Admin login before links appear.
  Checks resolve through live Cloudflare public DNS-over-HTTPS, with normal hostname TLS verification; no hardcoded edge IPs. Browser mappings come from those live DNS answers. Home/ISP DNS caches may still differ. One operator-authored PR comment is updated.
- Native GitHub deployments expose separate `pr-N-storefront` and `pr-N-admin`
  environments in the PR Conversation deployment timeline and repository
  Environments page. Each is transient/non-production and pins the exact head;
  creation disables auto-merge and unrelated required-context gating. Success
  URLs appear only after acceptance. Repeated runs recover existing operator-owned
  receipts without duplicate deployments/statuses. Updates inactivate old heads;
  retirement, suspension, interruption and failure inactivate owned receipts.
  GitHub publication failures after acceptance retry without stopping the apps.
- Closed/merged PRs are individually rechecked, exact tunnel/DNS routes removed,
  Compose stopped with that PR's synthetic volumes removed, and its comment
  retired. Never sweep global Docker volumes/images or arbitrary DNS records.
- Fail closed if GitHub cannot be checked. Retry new heads; a failed SHA needs
  an operator-cleared `failed_sha` in private state before same-head retry.
  No repeated migration loop. Private logs are never copied into PR comments.

## Host controls and remaining limits

Each app stack is capped at4GiB RAM (no additional container swap),2CPU, bounded
PIDs and logs. Stop API/storefront before the equivalent migration container
runs. With two slots this bounds configured app-stack limits to8GiB/4CPU.
The shared Cloudflare connector has its separate192MiB/0.25CPU ceiling.

The app network uses Docker29's `gateway_mode_ipv4=isolated` and `internal:true`:
no bridge gateway address or ordinary LAN/internet routing. Only trusted Nginx
joins ingress and app networks; its config is operator-owned. Verify on the
actual host before enabling. This is not a VM-grade kernel security boundary.

Disk thresholds (30GiB free and80GiB preview pool) are checked on every cycle and
before imports; on breach preview writers stop without deleting data. They are
**watermarks, not filesystem hard quotas**. A burst can exceed a threshold between
cycles. Full disk quotas require a separately provisioned quota-capable storage
pool. Pool accounting conservatively double-counts shared image layers. Builds
stay off-host, artifacts expire after2days, imports use temporary directories.

## Configure and prove

Start from `controller.example.json`; keep it outside the checkout with mode0600.
Use a dedicated Cloudflare tunnel. Preserve all unrelated ingress rules and DNS.
`CLOUDFLARE_API_TOKEN` needs DNS edit on this zone and tunnel edit on its account.
Keep the credential in the protected OpenClaw store; a Gateway scheduled script
can invoke the operator-installed controller with protected egress injection.
Never print/copy the opaque credential into cron, files or PRs.

The runtime needs authenticated `gh`, Docker Compose, Python3.11+, Node,
Playwright Core and Chromium. Set `PREVIEW_PLAYWRIGHT_MODULE`,
`PREVIEW_CHROMIUM_PATH`, and (if required) the private browser library path in
an operator-owned wrapper. The browser smoke is not executed from PR artifacts.

```sh
python3 controller.py --config /absolute/private/controller.json
python3 -m unittest discover -s . -p 'test*.py' -v
# Only after reviewing the plan, applying isolation checks and enabled=true:
python3 controller.py --config /absolute/private/controller.json --apply
```

The existing manually named `chef-preview-pilot` must be adopted or stopped
before automatic deployment, not silently ignored. Adoption must preserve its
existing PREVIEW_ID, URLs, ports, credentials, volumes and image receipt; reserve
slot0. Recreate its network without deleting volumes to apply isolated mode.
Keep the pilot env backup and DB snapshot until rollout acceptance passes.

Install one recurring reconciler (e.g. every5minutes), with no overlapping jobs,
execution timeout and failure alerts. Use a script payload, not an LLM agent turn.
A global lock provides a second overlap guard. Reconciliation also performs
orphan cleanup for recorded closed PRs on every run; GitHub failures never imply
that a PR is closed. Unknown/untracked resources fail admission for operator
investigation, rather than being automatically deleted.

Do not enable for all PRs until the workflow is on the default branch and each
candidate contains the preview-mode/seed changes. Existing old branches need
an update from main and a new successful build. The pilot originally used a
preview-build label; the new workflow builds every eligible non-draft same-repo
PR on opened/synchronize/reopened/ready_for_review events.

## Recovery

Pause scheduling before repairing state. A failed migration preserves
`before-update.sql`, `previous.env`, volumes and private logs. Restore the DB
snapshot and compatible previous image together if rollback is needed; do not
start the old app against an unknown partially migrated schema. Credentials
can be read privately by the operator from `pr-N/preview.env`, never PR comments.
On reopened PRs after cleanup, initialization creates a fresh synthetic dataset.

## DNS migration troubleshooting

If a preview redirects to `chefeventhub-com.l.ink`, that response is Porkbun
parking, not the preview application. Compare the device/system resolver against
`1.1.1.1`, `8.8.8.8`, Cloudflare authoritative nameservers and the `.com` registry
referral. During the nameserver migration, the home AT&T resolver retained the
old Porkbun delegation even while public resolvers and the registry were correct.
A local cache flush alone did not fix that upstream answer. Use a current resolver
on the affected device (including IPv6 DNS, if configured), then reopen the original
preview URL, not the redirected parking URL. Do not disable TLS or hardcode edge
addresses. Report public-DNS acceptance separately from affected-device access;
a passing resolver-overridden browser check does not prove the user's DNS works.
