# Meal Prep stack and discovery verification

This harness addresses PR #20 review `5720561794`: successful review-queue jobs
are not application verification. PR8 extends it for fulfillment, operational reporting and the final migration; runtime flags remain disabled.

Use Node **24.22.1** (`.nvmrc`), the checked-in Yarn **4.5.0** runner, and a
**disposable PostgreSQL 16 server**. Do not supply production credentials.

```bash
node .yarn/releases/yarn-4.5.0.cjs install --immutable
export NODE_ENV=test FILE_PROVIDER=local MEDUSA_TELEMETRY_DISABLED=1
export STRIPE_API_KEY=sk_test_verification_only STRIPE_WEBHOOK_SECRET=whsec_verification_only
export RESEND_API_KEY=re_verification_only RESEND_FROM_EMAIL=test@example.invalid
export MEAL_PREP_TEST_DATABASE_URL=postgres://test:test@127.0.0.1:5432/integration
export AVAILABILITY_TEST_DATABASE_URL="$MEAL_PREP_TEST_DATABASE_URL"
export TEST_DATABASE_URL="$MEAL_PREP_TEST_DATABASE_URL"
bash scripts/verify-meal-prep/checks.sh tests
bash scripts/verify-meal-prep/checks.sh builds
export PGHOST=127.0.0.1 PGPORT=5432 PGUSER=test PGPASSWORD=test
node scripts/verify-meal-prep/migrations.cjs
```

`checks.sh` stops on any failure, requires all three explicit database URLs, and
rejects skipped, empty, todo or runtime-error suites in Jest JSON results. Run
from any directory. Reports default to `artifacts/meal-prep-verification`; set
`REPORT_DIR` to an absolute path to override. The full combined suite includes
capture/approval/billing/autopay/fulfillment tests imported into the foundation realm, avoiding Medusa's
cross-realm DML metadata conflict.

The migration harness never reads ambient `DATABASE_URL`: it creates two uniquely
named databases using the explicit `PG*` connection, then injects each URL only
into its Medusa child process. The integration database stays separate from public
application tables. The server user needs CREATE DATABASE permission. No existing
database is dropped. Locally, remove the disposable container after inspecting the
reports; CI removes its service with the runner.

It migrates an empty database, archives exact PR8 parent `f4557fab9d75b515611645be44bbabeb0bda1b10`,
migrates that parent in the second database, seeds draft/revision/outbox/Availability
and populated PR6/PR7 financial and notification rows, upgrades them, compares row hashes, rolls back only
PR8 while its fulfillment history is empty, and reapplies it. Existing PR6/PR7
financial history remains populated throughout. Table removal/restoration and unchanged
parent row hashes are asserted. Populated-history rollback refusal runs in the
integration suite. Migration scripts/link synchronization are intentionally skipped.
Parent dependencies reuse the head install **only after all workspace manifests,
lockfile and Yarn config match**. Otherwise the archived parent gets its own
immutable install and runs its own Medusa CLI. A restacked parent still requires
updating and reverifying the pinned baseline.

The workflow is scoped to PRs targeting this stack's parent branch. It checks out
**the exact PR head**, not the synthetic merge commit; uses read-only permissions,
no persisted Git credentials, dummy provider values and no deployment secrets;
and uploads logs/Jest reports even on failure. A successful `verify` job means
executed checks, unlike the separate automated-review `queue` job. Review against
a changed parent still requires combined-stack verification. Retargeting this PR
requires revisiting the workflow branch filter and pinned migration baseline.

This supplies reproducible evidence, not a claim that the automated reviewer has
executed tests or inspected artifact contents. The shared review worker supplies authenticated artifact contents and pinned source
through its bounded evidence collector; it does not execute PR code itself. The added provider regressions also verify existing private-event initiation, fees,
account selection, authorization and capture with mocked Stripe transport.
There is no guaranteed confidence score, live provider
proof, production-scale migration, payment/notification E2E or deployment here.

See [final owner setup and manual checklist](../../docs/meal-prep/final-owner-testing.md) and the [full requirements-to-tests matrix](../../docs/meal-prep/requirements-to-tests.md). The complete run also writes 12 reference-only method/recurrence operation snapshots under `owner-scenarios/`. These are test fixtures, not enabled customer E2E or release approval.


## Read-only storefront discovery (contract v1.2/r5, matrix r3)

The discovery HTTP module suite runs in a separate Jest process to avoid Medusa
2.7 entity metadata crossing VM contexts. It uses real PostgreSQL and contributes
to the same no-skipped-tests assertion. The discovery PR also adds rendered
storefront/loader and Admin tests, including lost Save responses, and preserves
private-event acceptance-email behavior through a stubbed notification boundary.

After building both applications, run the actual browser suite:

```bash
node node_modules/@playwright/test/cli.js install --with-deps chromium
export DISCOVERY_BROWSER_DATABASE_URL=postgres://test:test@127.0.0.1:5432/discovery_browser
bash scripts/verify-meal-prep/browser.sh
```

`browser.sh` refuses a nonlocal/nonfixture database name or an existing database.
It creates and migrates its own database, seeds a local test admin, region,
publishable key and Meal Prep configuration, starts the built Medusa and
storefront, runs Chromium, then stops both processes. Ports 9001 and 3000 must be
free. Reports/screenshots are included in the CI artifact. The browser tests
exercise HTTP Saves, SSR/hydration, navigation, focus, malformed/private data,
503 recovery, and Admin response loss/409 behavior. Database outage injection is
limited to the dedicated fixture and restored in `finally`.

On a host without Chromium libraries, set `DISCOVERY_BROWSER_DOCKER=1` to run just
the browser worker in `mcr.microsoft.com/playwright:v1.56.1-noble`; Medusa and
storefront continue to run with the host Node toolchain. This requires Docker and
host networking. No production provider or email delivery is used.

See [the 17-scenario mapping, screenshots and Arbor handoff](../../docs/meal-prep/storefront-discovery-pr1.md).
