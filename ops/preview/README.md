# NUC preview pilot

Status: live manually operated PR 41 pilot, **not an automatic PR lifecycle**.
Only trusted same-repository code. No self-hosted Actions runner or production
credentials. Production Coolify applications are not modified.

## Verified pilot evidence (2026-11-17)

Initial GitHub-hosted build run `44007442289` built application images at
`26c69b0539273d92e39fd08c6f6fe51458f3ff22`. A second deployment from successful
run `44008793538` now runs `761770f111febab673d04892c3674f59cdb662f4` for both apps. Fresh migrations and synthetic seed
completed. Admin login, four experiences, one menu, available slots, a synthetic
request, rendered captured email and byte-identical upload/download passed.
Application containers cannot reach an external HTTPS address (`ENETUNREACH`).
Six focused tests pass (email capture, seed retry preservation, current-head guards).
Local full-project typechecking used an existing checkout dependency tree and
reported baseline/dependency-resolution errors; it is not claimed as passing.
Seed retry plus app-container recreation preserved edited pricing and uploads.
The forwarding-only SSH tunnel to Hetzner is enabled and API/store HTTP probes
pass from Hetzner. Browser storefront, request page and Admin login shell returned 200 without
page errors. Public TLS, redirect and public upload/download passed after Pabs added the
Porkbun wildcard A record. The selected hostnames now serve this pilot; some
resolvers may briefly cache the old parking record. Payments and automated PR
lifecycle are not enabled. See local operator evidence for later deployment receipts.

## Budget and isolation

One stack is limited to 4096 MiB RAM with no additional swap allowance, 2 CPU
cores' worth of quota, and bounded container logs. PostgreSQL/Redis have no
published ports; a fixed Nginx ingress proxy binds app ports only to loopback. Named volumes persist across
recreation. Internal Docker networking denies normal external/LAN routing.
This is **not a VM-grade security boundary**: Docker shares the host kernel and
the internal network alone does not guarantee isolation from host gateway
services. Do not enable unattended execution of arbitrary branch code here.
The initial pilot has no aggregate pool cgroup or hard volume disk quota. Keep
one stack until those controls, host-network isolation and storage monitoring
are proven. Planned two-stack budget is 8 GiB / 4 CPUs / 60–100 GiB disk.

## Prepare

Requires Python 3, Docker and Compose. Keep generated configuration outside Git:

```sh
python3 ops/preview/init-pilot.py "$HOME/.local/share/chef-previews/pilot.env"
docker compose --env-file "$HOME/.local/share/chef-previews/pilot.env" \
  -f ops/preview/compose.yaml up -d --wait postgres redis
```

Initialization refuses to overwrite existing credentials. Do not print
`docker compose config` output: it includes expanded private values. Use
`config --quiet` for validation. Never use the repo's reset/nukedb or hard-coded
Admin-account convenience scripts for previews.

## Images

Label a trusted same-repository PR `preview-build`. The GitHub-hosted workflow
builds both apps at the exact head SHA, with no deployment/production secrets.
It uploads per-app Docker archives, SHA receipts and checksums (2-day retention).
Download a successful run using `gh run download`; check both source receipts
match the current open PR head and verify the archive hashes before `docker load`.
Set MEDUSA_IMAGE/STOREFRONT_IMAGE in the private env file to those exact SHA tags.
No source builds run on the NUC. Artifact transport is a pilot choice; GHCR
immutable digests and read-only pull credentials are the next production path.

## Manual pilot deployment

After reviewing the branch and a successful image run:

```sh
python3 ops/preview/deploy-pilot.py PR_NUMBER SUCCESSFUL_RUN_ID
```

The helper holds one host lock, checks open/same-repository/current-head state,
verifies artifact checksums and image revision labels, runs one migration/seed
executor and gates startup on their logs. It saves private evidence under
`~/.local/share/chef-previews`. Its API/storefront probes establish only surface
health, not completed feature acceptance. Errors stop the deployment without
resetting its volumes. It does not create an automated deployment scheduler.

Selected public naming: `pr-N.preview.chefeventhub.com` and
`api-pr-N.preview.chefeventhub.com`. As of setup, authoritative DNS is Porkbun
and no Chef EventHub zone exists in the available Cloudflare account. Owner selected Hetzner HTTPS proxy routing; no DNS migration.

A dedicated `chef-preview-tunnel` SSH account allows only reverse forwards at
`10.0.1.1:19100` and `10.0.1.1:13100`, with no shell sessions. The NUC's user
service `chef-preview-tunnel.service` maintains the connection using a dedicated
key. Existing root access and OpenClaw tunnel are unchanged. Route config is active at `/data/coolify/proxy/dynamic/chef-preview-41.yaml`;
a source copy remains under `preview-staging/`. Public DNS was added by Pabs,
and private pilot env URLs now use the HTTPS hosts.

For future reconstruction, the DNS gate is A `*.preview` -> `5.78.148.212` at Porkbun, preserving other records.
After authoritative DNS confirms both hostnames, update the private pilot env:
API_URL=https://api-pr-41.preview.chefeventhub.com and
STOREFRONT_URL=https://pr-41.preview.chefeventhub.com, then recreate app/proxy
containers. Atomically install the staged route as
`/data/coolify/proxy/dynamic/chef-preview-41.yaml`; Traefik watches this directory,
so production proxy restart is unnecessary. Verify issued TLS, redirects, CORS,
Admin login, storefront and uploaded media URL behavior. Old local upload URLs
remain local unless replaced; use a fresh upload for public URL verification.
Do not advertise the public pilot until this passes.

Rollback ingress: move only this route out of `dynamic/` and stop the NUC's
`chef-preview-tunnel.service`; application named volumes remain intact. No
production application container or existing proxy file needs to change.

## Controlled startup details

1. Stop only this pilot's API/storefront before migration on subsequent deploys.
2. Run one `docker compose ... --profile app run --rm medusa
   /app/apps/medusa/node_modules/.bin/medusa db:migrate` executor.
   Inspect every module result; a final success/health status alone is insufficient.
3. Run `medusa exec ./src/scripts/preview-seed.js`. It creates USD commerce
   defaults, synthetic experience/menu pricing, demo Chicago hours and a private
   Admin account, preserving existing records/passwords. It writes the publishable
   key into `preview-emails/bootstrap.json`. Verify two consecutive runs.
   Existing `init.ts` is NOT idempotent. Do not run it on each deployment.
4. Create a preview-only Admin with a generated password, and configure the
   resulting publishable key in the private env file. Never publish credentials.
5. Start app services, verify schema, Admin authentication, store rendering,
   demo availability, request creation, captured emails, and upload/download.
6. Redeploy the same stack and verify persisted reviewer changes and uploads.

The compose API command is start-only, so it cannot race a second startup
migration. `sk_test_preview_disabled` is intentionally not a real Stripe key;
payment/Connect, Calendar, AI and media-import integrations are unavailable.
No external dispatch is intended. The backend captures rendered email JSON
under its private `preview-emails` volume, not a public static route.

Before public ingress, decide the domain, configure TLS/access control,
`noindex`/robots and preview branding, verify Admin's built API URL and update
all URL/CORS values. Preserve existing OpenClaw tunnels. A private local pilot
can be reached through an SSH tunnel forwarding 13000 and 19000.

## Stop / rollback

`docker compose ... stop` preserves all state. A failed update must not
reinitialize data. Reuse the previous compatible image and take a database
snapshot before schema-changing deployments. Do not run `down -v` unless
explicitly retiring this preview and all of its synthetic data.

## Remaining lifecycle work

Live seed retry/preservation acceptance; guarded exact-head deployment; image digest
verification; aggregate pool caps, storage admission and host/LAN isolation;
preview routing/access; readiness-gated single PR comment; close cleanup and
nightly orphan reconciliation from trusted default-branch code. Fail closed
when GitHub state cannot be verified. Do not advertise a URL as ready until
app acceptance has passed.
