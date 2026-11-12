# Verification record — 2026-11-12

Tested application/dependency revision: **a6c167290c5a14ffebe6e123f9e08c605821f5f6**.
Final evidence changes are documentation only. Baseline and remote recheck both
`b5ac172c2d7961dc729fe398a2e495f2d26eb52a`.

`yarn.lock` SHA256:
`64582d3e96be11701686d408ff8990d4eb3062da1bff753337878c13b0651d9c`.

Host Node was 24.22.2; every install/check used the downloaded **24.22.1** at
`/tmp/medusa-upgrade-tools/node-v24.22.1-linux-x64/bin`, without replacing host Node.
Yarn **4.5.0** is repository-pinned. A fresh `git archive` of the tested commit at
`/tmp/medusa-upgrade-final-v2` had no reused or symlinked node_modules. Exact commands
and terminal exit codes are in [results.json](evidence/results.json); logs and their
hashes are checked into [evidence](evidence/sha256.json).

| Check | Result |
| --- | --- |
| `corepack yarn install --immutable` | Exit 0, fresh archive; peer warnings remain |
| `corepack yarn workspace medusa typecheck` | Exit 0 |
| `corepack yarn workspace storefront typecheck` | Exit 0 |
| Both workspace `test:unit` | Medusa 23 suites / 204 tests; storefront 3 / 18; exit 0 |
| Both workspace `build` | Exit 0, including the full backend compilation and Admin build |
| Medusa `lint` | Exit 0; 0 errors, 155 warnings (not warning-free) |
| `test:integration:http --testPathIgnorePatterns=health.spec` | Exit 0; 7 suites / 37 outer tests |
| `test:integration:http --runTestsByPath integration-tests/http/health.spec.ts` | Exit 0; 1 test |
| `test:integration:modules` | Exit 0; 2 suites / 15 tests |
| Both `docker build --no-cache --progress=plain` | Exit 0; pruned immutable installations/builds as UID 1000 |

The HTTP wrappers also run child suites; 37 is the outer Jest count, not a claim
that all child assertions are counted there. Included: booking-native-execution,
booking-migration, booking-scheduling, scheduling-domain, availability-concurrency,
availability-save and chef-workspace. Native fixtures connect to **real Redis** and
PostgreSQL and replace OS processes. Health uses ordinary test configuration and is
**not** Redis durability proof. The module suite includes older pre-Scheduling
availability migrations and social-gallery jobs.

## Reproduction

`verify.py` runs the commands above, records each exit status and returns nonzero
if any check fails. In a fresh archive, set Node 24.22.1 first on PATH and provide:

```sh
export UPGRADE_EVIDENCE_DIR=/tmp/medusa-upgrade-evidence/final-v2
export BOOKING_TEST_DATABASE_URL=postgres://postgres:upgrade-fixture-only@127.0.0.1:32777/postgres
export BOOKING_TEST_REDIS_URL=redis://127.0.0.1:32778/4
export AVAILABILITY_TEST_DATABASE_URL="$BOOKING_TEST_DATABASE_URL"
export TEST_DATABASE_URL="$BOOKING_TEST_DATABASE_URL"
export SOCIAL_GALLERY_TEST_DATABASE_URL=postgres://postgres:upgrade-fixture-only@127.0.0.1:32777/social_gallery_test
export DB_HOST=localhost DB_PORT=32777 DB_USERNAME=postgres DB_PASSWORD=upgrade-fixture-only
export FILE_PROVIDER=local STRIPE_API_KEY=sk_test_fixture RESEND_API_KEY=re_fixture RESEND_FROM_EMAIL=fixture@example.invalid
python3 docs/upgrades/medusa-2.22.6/verify.py
```

These credentials identify disposable synthetic fixtures, not production secrets.
Containers were postgres:16-alpine and redis:7-alpine, loopback bindings only. Create
`social_gallery_test` first. Use the localhost DB_HOST spelling for the Medusa
health runner: the target helper otherwise enables SSL against this non-SSL fixture.
Queue names belong under `options.redis` in the native fixture; each suite uses a
random database/queue prefix. The integration runner's test-mode in-memory modules
are deliberately separate from the native Redis worker fixture.

Docker commands, from the tested source tree:

```sh
docker build --no-cache --progress=plain -f apps/medusa/Dockerfile -t medusa-upgrade-backend:a6c1672 .
docker build --no-cache --progress=plain -f apps/storefront/Dockerfile -t medusa-upgrade-storefront:a6c1672 .
```

Inspected image IDs (both `Config.User=1000`):

- Backend: `sha256:e062c0b89289603fe3888f71547fad53b2d8e946d0c3c4acac8097ad1bceff2e`
- Storefront: `sha256:1730c53319d2792b18f98cd9074ab06c4ff5d47cb98193e4caec07ba68ec1fbe`

## Populated migration and restore

An independent immutable baseline install at `/tmp/medusa-upgrade-baseline` ran
2.7's full `db:migrate`. `integration-tests/upgrade/seed.ts` created synthetic held
and confirmed events, exact protected intervals and attempt IDs, a 425.25 total,
a product link and completed native workflow history. A `pg_dump -Fc` snapshot was
restored into `upgrade_rehearsal` and migrated using:

```sh
corepack yarn workspace medusa medusa db:migrate --execute-all-links --execute-safe-search
```

The command ran twice successfully. The target ledger includes the new nullable
experience field migration. `rehearsal-before.json` and `rehearsal-after.json`
compare all rows of chef_event, scheduling_reservation, chef_event_acceptance_attempt,
product_product_chefeventmodule_chef_event and workflow_execution, ordered by ID.
The first four tables are exactly equal. Workflow history is equal after excluding
only the upstream-added `run_id` column; existing state, context and results survive.
A separate restore into `upgrade_final_restore` exactly matched all five baseline
tables. The original 2.7 application was built and booted from `.medusa/server`
against that restore; `/health` returned 200. This main-shaped full-app fixture is
separate from the older pre-Scheduling schemas exercised by integration tests.

`history-check.ts` was run against another fresh upgraded clone (`upgrade_history`)
and the old-version restore, with empty isolated Redis databases. Both returned the
retained completed result, money 425.25, without invoking the deliberately failing
step. The probe explicitly uses native `idempotent: true`, as both booking workflows
do. A preliminary probe without that flag re-executed on 2.22.6; this demonstrates
why retention alone must not be confused with idempotency. It did not alter the
production workflow configuration. Full active Redis queue snapshot/restore and
real external-effect reconciliation still need representative release rehearsal.

The binary baseline dump remains at
`/tmp/medusa-upgrade-evidence/baseline-populated.dump`; only synthetic comparison
records/ledgers/logs are committed. Rollout and coordinated rollback are in README.

## Built browser evidence

The final archive's built Admin/backend and storefront were run against the
synthetic migrated database. Chromium/Playwright 1.56.1 ran in the matching
`mcr.microsoft.com/playwright:v1.56.1-noble` image as host evidence UID 1001.
Browser requests were restricted to loopback. Admin used a disposable TLS proxy
on 9020 → backend 9017 so production session cookies worked; storefront used 9018.
No dev Vite server was used for the final checks.

- Actual Admin login/session, direct Availability URL, Availability immediately
  after Store, one sidebar entry and no duplicate Extensions section passed.
- Workspace/calendar rendered. A synthetic no-notification ticket order exercised
  the private order-list Event column and order-detail override; its 425.25 amount
  and ticket item rendered. Explicit `*items` remains in the list request.
- Store product price/options, add-to-cart, digital shipping, checkout totals and
  invalid-promotion 400 form feedback passed. Tax provider was set to `tp_system`
  in this fixture; Stripe was removed from the fixture region's provider links,
  so checkout rendering is **provider-free**, not payment completion evidence.
- Final logs contain no page errors. Three additional storefront runs also passed.
  One earlier run during concurrent work reported `Cannot read properties of
  undefined (reading 'result')`; subsequent stack-enabled runs did not reproduce it.
  Its cause is unproven; retain a navigation/error-monitoring canary gate. Do not
  claim this was fixed or use it to justify an unrelated storefront Vite upgrade.

Harnesses, logs and screenshots accompany this record. The Admin harness's order
ID is synthetic and must be replaced when recreating its fixture. It is not a
portable production test account. Providers use dummy keys/mocked transport;
Stripe, Calendar, email, enabled reviews-plugin migration, representative sanitized
production data and the inaccessible Arbor assessment remain explicit release gates.

## Earlier failures and their disposition

- Fixed actual target Zod/ORM/DI/graph, sidebar and route-prefix incompatibilities.
- Corrected native fixture queue options and waiting for durable async completion;
  assertions for products/protection/notifications were retained.
- An earlier archive run under overlapping Docker builds timed out one 30-second
  elapsed-arrival fixture. Final exact-revision full HTTP run passed unchanged.
- Browser setup failures (host Chromium libraries, evidence UID permissions,
  production secure-cookie HTTP fixture, startup readiness) were corrected before
  final evidence. Missing fixture tax/provider configuration was not treated as a
  production Medusa allowlist regression.

No hosted CI, merge, deployment or production verification was performed. The
remaining gates are material release conditions, not claims of completed proof.

## PR #34 follow-up: main-sidebar deduplication

The original Admin screenshots above are historical pre-fix evidence: they show
promoted routes duplicated in the main sidebar. The follow-up adapter composes
with Unlock's real menu patch and filters only top-level extensions whose paths
are already in the resulting core routes. Target permission filtering and nested
extension attachment remain unchanged; source-marker drift fails the build.

Validation on Node 24.22.1: both workspace typechecks and production builds exited
0 (including both Medusa build phases). The main-sidebar and Availability-routing
suites passed all 9 tests, including reproducing the unadapted preset's duplicates,
checking all four promoted paths occur once, and preserving permitted unrelated
and nested extensions. `git diff --check` passed for the follow-up change.

A Chromium/Playwright 1.56.1 run against the new production Admin bundle, in a
network-disabled container with synthetic API responses, found exactly one link
for each of `/menus`, `/experience-types`, `/chef-events` and `/social-gallery`,
zero `/products` links and no page errors. The screenshot was visually inspected.
This is built-UI fixture proof, not authenticated backend or real-role RBAC proof;
provider, database and deployment release gates above are unchanged.
