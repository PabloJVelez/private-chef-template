# Frozen-tip local owner testing

Use the exact PR8 head SHA in the GitHub/T3 handoff. Its parent must be `f4557fab9d75b515611645be44bbabeb0bda1b10` on `feat/meal-prep-v1-autopay-reminders`. This procedure is for a new disposable development checkout. Do not use production credentials, databases, provider accounts or copied production `.env` files. Nothing here merges, deploys, charges or sends email.

## Checkout and toolchain

```bash
git clone git@github.com:PabloJVelez/private-chef-template.git meal-prep-owner-test
cd meal-prep-owner-test
git fetch origin feat/meal-prep-v1-fulfillment-validation feat/meal-prep-v1-autopay-reminders
# Paste the complete frozen head SHA from the handoff; do not use a moving tip.
export MEAL_PREP_OWNER_HEAD='<exact PR8 head SHA>'
git switch --detach "$MEAL_PREP_OWNER_HEAD"
test "$(git rev-parse HEAD)" = "$MEAL_PREP_OWNER_HEAD"
git merge-base --is-ancestor f4557fab9d75b515611645be44bbabeb0bda1b10 HEAD
git remote get-url origin
git status --porcelain
```

Stop on wrong origin/SHA/ancestry or unexpected edits. Read the full [contract](requirements-v1.1-r4.md), [PR8 scope/gates](pr8-fulfillment-validation.md), and [matrix](requirements-to-tests.md). Use **Node 24.22.1** (`nvm install && nvm use` from `.nvmrc`, or the official matching binary), checked-in **Yarn 4.5.0**, Git, Bash, Docker and a PostgreSQL **16** server. The host's Node 24.16.0 does not satisfy this repository. Installation/builds need several GB free disk and sufficient memory for both workspaces.

```bash
node --version
node .yarn/releases/yarn-4.5.0.cjs --version
node .yarn/releases/yarn-4.5.0.cjs install --immutable
```

Do not run `generate-env`, production bootstrap, reset or seed scripts. The verification process supplies environment values directly and never reads ambient `DATABASE_URL` for its database selection. Use a fresh shell to avoid inherited secrets.

## Disposable database and test environment

Run a new uniquely named container with no host volume. A random loopback-only port avoids an existing database. Keep its name for cleanup; never substitute an existing container name.

```bash
export MEAL_PREP_OWNER_CONTAINER="meal-prep-owner-$(date +%s)"
docker run --name "$MEAL_PREP_OWNER_CONTAINER" \
  -e POSTGRES_USER=test -e POSTGRES_PASSWORD=test -e POSTGRES_DB=integration \
  -p 127.0.0.1::5432 -d postgres:16
# Repeat until ready (normally a few seconds):
docker exec "$MEAL_PREP_OWNER_CONTAINER" pg_isready -U test -d integration
export PGHOST=127.0.0.1
export PGPORT="$(docker port "$MEAL_PREP_OWNER_CONTAINER" 5432/tcp | cut -d: -f2)"
export PGUSER=test PGPASSWORD=test
export NODE_ENV=test FILE_PROVIDER=local MEDUSA_TELEMETRY_DISABLED=1
export STRIPE_API_KEY=sk_test_verification_only STRIPE_WEBHOOK_SECRET=whsec_verification_only
export RESEND_API_KEY=re_verification_only RESEND_FROM_EMAIL=test@example.invalid
export MEAL_PREP_TEST_DATABASE_URL="postgres://test:test@127.0.0.1:$PGPORT/integration"
export AVAILABILITY_TEST_DATABASE_URL="$MEAL_PREP_TEST_DATABASE_URL"
export TEST_DATABASE_URL="$MEAL_PREP_TEST_DATABASE_URL"
export REPORT_DIR="$PWD/artifacts/meal-prep-verification"
mkdir -p "$REPORT_DIR"
git rev-parse HEAD > "$REPORT_DIR/head.txt"
```

These provider values are deliberately unusable outside mocked transports. No actual Stripe/Resend/Google connection is needed or authorized. Integration tests create randomly named schemas and remove their own schemas. The migration harness creates separate uniquely named databases and retains them for inspection; they are listed in `migration-databases.txt`. The test user needs CREATE DATABASE and schema/extension permissions on this disposable server.

## Ordered rehearsal and verification

```bash
bash scripts/verify-meal-prep/checks.sh tests
bash scripts/verify-meal-prep/checks.sh builds
node scripts/verify-meal-prep/migrations.cjs
git diff --check
```

The complete tests command rejects skipped, empty, todo, failed and runtime-error suites. The combined occurrence suite includes real-service fulfillment/approval/payment races; provider transports and email sinks are mocks. Builds cover Medusa backend/admin and storefront client/server. Review every log and summary under `$REPORT_DIR`, not just command exit status.

The actual Medusa runner discovers migrations by module; **do not manually reorder across module registration**. Required dependency order is:

1. Existing core/custom schemas, Availability `20261015000100`, experience scheduling `20261015000200`, private-event occupied-time/soft-delete fix `20261015000300`.
2. Meal-prep foundation `20261030000100`, shared scheduling bridge `20261030000200` after source tables exist, Availability setup `20261030000300`.
3. Meal-prep capture `20261030000400`, approvals `20261030000500`, billing `20261031000600`, autopay `20261031000700`, fulfillment `20261031000800`.

The executable rehearsal performs: **fresh final-tip install → installed Medusa adapter check → exact-parent install in a second DB → representative populated parent fixtures → final-tip upgrade → full parent hash comparison → PR8-only empty rollback → hash comparison → reapply → hash comparison**. Exact-parent archives reuse head dependencies only after matching all manifests, lockfile and Yarn configuration. Fresh/upgrade migration scripts and link synchronization are deliberately skipped. Both final databases retain installed module migrations; the Medusa adapter check exercises real installed order/unpaid-collection interfaces.

Rollback uses the last module migration batch, not a filename. The harness creates the parent first so only PR8 is in the upgrade batch. Do **not** copy its `db:rollback --modules mealPrep` command onto a fresh install: that batch may include every meal-prep migration. Any PR8 event makes its downgrade refuse; parent populated-history/active-reservation guards also remain enforced. Use forward fixes for nonempty history. On a local database you care about, take and verify `pg_dump` before any migration experiment. This procedure uses only disposable fixtures and never removes an existing database.

## Owner foundation walkthrough

The comprehensive run writes 12 reference-only operation snapshots to `$REPORT_DIR/owner-scenarios/`: one per method/pattern. Inspect them beside the test source `apps/medusa/integration-tests/http/meal-prep-fulfillment.suite.ts`. Each scenario creates an arrangement, separately approves its occurrence menu, links explicit actual work, plans and completes the method, then verifies unchanged schedule/payment and zero projection drift.

A focused replay is available after the full run; its intentionally skipped unrelated tests are **not** comprehensive verification:

```bash
node .yarn/releases/yarn-4.5.0.cjs workspace medusa test:integration:http \
  --runTestsByPath integration-tests/http/meal-prep-foundations.spec.ts \
  --testNamePattern='gated fulfillment|preserves scheduling'
```

Owner checks on this frozen head:

- [ ] Read all 12 snapshots: in-home/completed, delivery/delivered, pickup/collected for weekly, fortnightly, multiple weekly and custom dates. Verify explicit candidate dates, approved menu references, one linked work block, unpaid/no-bill state unchanged, and no private intake in reports.
- [ ] Inspect the two-order shared-work tests: each delivery/pickup order remains eligible; one actual-work reservation protects the chef; summaries do not calculate remaining capacity or reject counts.
- [ ] Replay approval/portion-change tests: pending requests preserve confirmed details; approved changes make the old plan stale; skip/reschedule/pause policy-dependent application stays rejected.
- [ ] Replay failed/authentication-required autopay tests: original booking/menu remains unchanged, fallback and chef follow-up appear, manual collection waits for safe reconciliation, no real provider calls occur.
- [ ] Inspect wrong-owner, stale-version, duplicate command, rollback and production-disabled cases. Resolving a manual flag must leave payment/missed-selection flags intact.
- [ ] Compare `upgrade-before.json` and `upgrade-after.json`; review fresh/upgrade/rollback/reapply logs and exact SHA. Record any failure before accepting the foundation layer.

## Manual browser and release E2E checklist

**This stack has no enabled meal-prep execution/customer UI.** `NODE_ENV=test` permits test service calls, not a user login/access policy or a production route. Do not flip frozen flags or add real credentials to turn this walkthrough into a launch test. The following remaining checklist must be completed after decisions and approved adapters/UX exist; mark it **blocked**, never passed from the service snapshots.

For local existing UI inspection, use the newly created **fresh** database name in `migration-databases.txt`, and a local environment with fake provider credentials. The backend is `node .yarn/releases/yarn-4.5.0.cjs workspace medusa dev` (port 9000); storefront is `node .yarn/releases/yarn-4.5.0.cjs workspace storefront dev` (port 5173). Pass `DATABASE_URL` pointing explicitly to that fresh disposable database for the backend only. A local admin user may be created with the installed `medusa user` CLI and a disposable email/password. The storefront additionally needs a local publishable API key and local store/region/dish configuration; use its checked-in `.env.template` as a **variable-name reference only**. Do not copy credentials, run generic seeds, connect live providers, or expect this empty database to reproduce a populated checkout. Record missing fixtures as a gate. The automated adapter rehearsal does not populate a complete browser store.

- [ ] Existing `/app/settings/availability`: navigation, timezone, hours, global time off, method/style drafts, radius/ZIP drafts, complete-snapshot saves, discard/unsaved-edit behavior and Google controls. Production meal-prep execution stays disabled.
- [ ] After D02/D03/D04/D05/D10 decisions: all three customer selection/intake/location/window flows, common base prices, free eligible in-area delivery and approved out-of-area handling; all four selection styles.
- [ ] After D06/D07/D09: all four recurring arrangements, initial menu approvals, portion/menu changes, reschedule conflicts, skips/pauses, missed selections, horizon/end/partial-conflict handling and DST cases.
- [ ] After D01/D04/D05/D10/D11 plus native payment reconciliation: actual Stripe **sandbox** exact-amount manual checkout, opt-in/setup/opt-out, decline/authentication, replay/timeouts and reminder timing. Do not use live keys or charge real customers.
- [ ] After email/access/dedupe integration: approval link, unpaid reminder, failed-autopay fallback and missed-selection notification arrive once, authenticated to the correct household.
- [ ] After D08 and fulfillment UX approval: each method's execution and unpaid-service behavior; chef follow-up, corrections and operational state remain independent of payment/schedule.
- [ ] Existing private events: request/acceptance conflict protection, ticket inventory, checkout, additional charges, payment authorization/capture, fulfillment, emails and receipts with approved disposable provider fixtures. Automated provider regressions cover only part of this E2E.
- [ ] Production-volume representative migration/recovery rehearsal and explicit owner acceptance of the frozen tip. D12 external-calendar assurance is resolved separately; internal PostgreSQL exclusion does not guarantee external calendar race prevention.

Record issues in BTS-7/GitHub with SHA, method/pattern, expected/actual behavior and sanitized evidence. Request policy decisions in BTS-2; send architecture deviations to BTS-3 through ChatGPT. Amend/restack and rerun affected checks after changes. No middle-stack merge, deployment or feature activation follows automatically from any green test.

After preserving reports, remove **only** the disposable container created above:

```bash
docker stop "$MEAL_PREP_OWNER_CONTAINER"
docker rm "$MEAL_PREP_OWNER_CONTAINER"
```
