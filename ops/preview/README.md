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

## Cloudflare cutover evidence (2026-11-17)

The domain is active on Cloudflare Free. Valid public TLS, HTTP301 -> HTTPS,
storefront/request browser rendering and authenticated Admin login passed.
Public API CORS, four experience types, one persisted menu,20 available slots,
and byte-identical fresh upload/download passed with the new flat hostnames.
Browser smoke reported no page errors. A Cloudflare IP resolver override was
used for checks while the NUC resolver cached Porkbun's old wildcard response;
TLS validation remained enabled.

The old preview-only SSH service is disabled/stopped and its Traefik route
archived at `preview-staging/chef-preview-41-before-cloudflare.yaml`. API/auth,
CORS, availability and upload checks passed again with that tunnel stopped.
Production API and storefront remained200. Existing OpenClaw ingress was not
changed. Old nested preview links are retired; use the new URLs. Old uploaded
media URLs were not rewritten. Pilot env rollback copy is private at
`~/.local/share/chef-previews/pilot-before-cloudflare.env`.

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

## Cloudflare ingress

Selected naming is now `pr-N-preview.chefeventhub.com` and
`api-pr-N-preview.chefeventhub.com`. These single-level names are covered by
free Universal SSL. Nested `pr-N.preview...` names require different certificate
coverage and are the legacy Hetzner route only.

Porkbun remains the registrar. Authoritative DNS has moved to Cloudflare Free;
all 14 original records were preserved, including production A records, email
MX/SPF/DKIM/DMARC, wildcard and existing ACME TXT records. The apex ALIAS became
a DNS-only flattened CNAME to the same Porkbun target. Existing app records
remain DNS-only; only the two new preview CNAMEs are proxied. No production
hosting move occurred. HTTPS redirect is enabled for proxied traffic.

A dedicated remotely managed `chef-previews-nuc` tunnel forwards the exact
storefront/API hostnames to NUC loopback ports 13000/19000, with a fallback404.
See `cloudflare-ingress.example.json`. Install the example user service after
saving its token privately at `~/.config/cloudflared/chef-previews.token`
(mode0600); never commit or log it. The existing OpenClaw tunnel is separate.
The connector has an additional192MiB memory ceiling and25% CPU quota beyond
the application stack's4GiB/2CPU ceilings.

Cutover gate: verify the zone is active and Universal SSL serves valid TLS
before changing application origins. Back up the private pilot env, then set:

```text
API_URL=https://api-pr-41-preview.chefeventhub.com
STOREFRONT_URL=https://pr-41-preview.chefeventhub.com
```

Recreate only the pilot medusa/storefront/proxy services; keep data volumes,
PostgreSQL and Redis intact. Verify Admin login in the browser, storefront and
request rendering, CORS, availability, and fresh upload/download URLs. Cached
Porkbun wildcard answers can temporarily return a parking redirect. Compare
public/authoritative DNS and use a documented Cloudflare IP override for tests
if needed; retain normal TLS verification. Public HTTPS is not complete until
certificate issuance and these checks pass.

### Legacy route and rollback

`traefik-pr-41.yaml` describes the old Hetzner route. The forwarding-only account
`chef-preview-tunnel` and NUC user service `chef-preview-tunnel.service` provide
reverse forwards at10.0.1.1:19100/13100. The old public names and wildcard DNS
are retained during migration. After the new route passes acceptance, disable
the old NUC SSH tunnel and move only `/data/coolify/proxy/dynamic/chef-preview-41.yaml`
out of Traefik's watched directory, preserving a rollback copy. Do not restart
production Traefik or touch other routes or the existing OpenClaw tunnel.

To roll back, restore the saved private env, recreate only pilot app/proxy
containers, restore the legacy route, and restart the old SSH user service.
No DNS rollback or volume reset is needed for the legacy DNS-only hostnames.
Existing uploads retain their stored absolute URLs; new uploads use the current
API origin. Preserve the old route if old media URLs still need to work.

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
