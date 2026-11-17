# NUC preview pilot

Status: manually operated pilot foundation, **not an automatic PR lifecycle**.
Only trusted same-repository code. No self-hosted Actions runner or production
credentials. Production Coolify applications are not modified.

## Budget and isolation

One stack is limited to 3968 MiB RAM with no additional swap allowance, 2 CPU
cores' worth of quota, and bounded container logs. PostgreSQL/Redis have no
published ports; app ports bind only to loopback. Named volumes persist across
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

## Controlled startup (not yet automated)

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
