# Node 26 runtime handoff

Scope: Node **26.13.1 LTS**, Medusa **2.22.6**, Yarn **4.5.0**. Base is merged
PR #34, `80f7ae3af4070f5b0d76c6ce6072413d01363d73`; fresh `origin/main` matched.
No production access, deployment, merge, feature enablement or schema changes.
The owner-reported Medusa deployment/payment flow is prior context, not Node 26 proof.

## Release and pin inventory

Checked 2026-11-12 against `https://nodejs.org/dist/index.json`, the Node release
schedule, official SHA256 sums, and Docker's OCI manifests. Latest stable Node 26:
**26.13.1**, released **2026-11-10**, LTS **Lithium**, `security: true`.

- Root, Medusa and storefront `engines.node` and `.nvmrc`: exact `26.13.1`.
- Both app Dockerfiles: `node:26.13.1-alpine3.24` (Alpine 3.24.4), OCI index
  `sha256:6bd9ab43c0ec0190ca7b2d193906cb8b7edf6e7f4afa43ddeccd6452710bffb5`.
  amd64 manifest: `sha256:a90bda2938f2b57112d94ee2e3722c5346efca76e4a034042b5223197567a16c`;
  arm64: `sha256:5b1cae3b6a917e4c6ee860d8eb5bd77655e75f13964c061f8755ccbc29e64312`.
  Local validation is linux/amd64; arm64 availability is registry evidence only.
- Review host: `node:26.13.1-bookworm-slim`, OCI index
  `sha256:5df79989ed685e09f0a98019db4cebfb22fb9df1a53c0161664a011f7ff6b0f1`.
- Official Linux x64 tarball SHA256:
  `5c063e46bab0fbc1c17cc445d7ff129cbdcd0471be6ed83b6ab864f8143bc864`.
  arm64: `89e1853138db51e8b82d3e98ba9c0d3f2956a28e5e55ea1b7e12d25aae92d5dd`.
- Node 26 images/tarballs no longer supply Yarn/Corepack. Explicit Corepack **0.36.0**
  bootstraps checked-in Yarn **4.5.0**; no Yarn upgrade. Docker and the opt-in CI
  composite install Corepack explicitly. Python-only review workflows need no Node
  setup; Docker composite actions inherit Dockerfile pins. Actions' embedded
  runtimes are independent of the application runtime.
- Legacy Nixpacks `nodejs_22` is replaced by a checksum-verified Node bootstrap,
  with `/opt/node/bin` on PATH. Non-login build shells preserve that PATH. Its
  bootstrap was exercised on Linux x64; a complete Nixpacks deployment was not run.
- Current prerequisites/tooling docs are aligned. Historical Medusa evidence and
  its Node 24-only reproduction harness remain unchanged. Node type declarations
  remain unchanged; successful workspace typechecks do not require upgrading them.

## Demonstrated compatibility repair

First clean Node 26 run at `4958ad2678e4f11d5c249295cebf3e510ba5793f` failed to
load Medusa: JWA imported `buffer-equal-constant-time`, which dereferenced removed
`SlowBuffer.prototype`. `yarn up --recursive jwa` changes only JWA **1.4.1 → 1.4.2**
and **2.0.0 → 2.0.1**. Both upstream patches use `crypto.timingSafeEqual` on modern
Node and defer the legacy fallback. No global polyfill or authentication bypass.
JWT regressions exercise valid/tampered/truncated signatures, wrong secrets,
expiration, algorithm restrictions, RSA and ECDSA. Medusa/reviews/SWC/Vite and
other dependency versions remain unchanged.

## Verification and evidence

Preflight application revision: `70c1a22` (full SHA in the PR record). A fresh
`git archive` installed immutably without reused/symlinked `node_modules`:

- Both typechecks, both unit suites and both production builds passed, including
  Medusa Admin. Medusa: 25 suites / 211 tests. Storefront: 3 suites / 18 tests.
- Medusa lint passed with 157 existing warnings and zero errors.
- Native HTTP: 7 suites / 37 outer tests, including child suites for auth, Private
  Event acceptance, persisted Redis workflow recovery, Scheduling protection and
  calendar/availability. Stripe adapter tests use mocked transport/dummy keys.
- A fresh immutable Node 24 install of the exact base populated a disposable
  `upgrade_main` database. Node 26 migration and repeat migration preserved the
  complete schema, all three migration ledgers and all rows of chef events,
  Scheduling reservations, acceptance attempts, event/product links and native
  workflow history. Only pg_dump's randomized restrict tokens were normalized.
- Review helper: 74 tests passed. Clean Node 26 review-host image and actual
  installed CLI passed the restricted fake-provider smoke, with network disabled.

The PR description records **final exact-head** install/build/typecheck/test and
Docker outcomes, image IDs, commands, log hashes and any failures. Do not infer
an unrecorded check passed. Local raw evidence: `/tmp/private-chef-node26-evidence`;
final exact-head evidence: `/tmp/private-chef-node26-exact-evidence`. No production
credentials or data belong in these directories.

## Reproduction

Download/check the official tarball above and put its `bin` first on PATH; install
Corepack 0.36.0 there. Do not replace host Node. Create task-owned PostgreSQL 16 and
Redis 7 containers with loopback published ports. The run used PostgreSQL 32779,
Redis 32780 and password `node26-fixture-only`; these are disposable fixture values.
Create `social_gallery_test` before the integration module suite.

```sh
export UPGRADE_CODE_SHA=$(git rev-parse HEAD)
mkdir -p /tmp/private-chef-node26-exact
git archive "$UPGRADE_CODE_SHA" | tar -x -C /tmp/private-chef-node26-exact
cd /tmp/private-chef-node26-exact
export UPGRADE_EVIDENCE_DIR=/tmp/private-chef-node26-exact-evidence
export BOOKING_TEST_DATABASE_URL=postgres://postgres:node26-fixture-only@127.0.0.1:32779/postgres
export BOOKING_TEST_REDIS_URL=redis://127.0.0.1:32780/4
export AVAILABILITY_TEST_DATABASE_URL="$BOOKING_TEST_DATABASE_URL"
export TEST_DATABASE_URL="$BOOKING_TEST_DATABASE_URL"
export SOCIAL_GALLERY_TEST_DATABASE_URL=postgres://postgres:node26-fixture-only@127.0.0.1:32779/social_gallery_test
export DB_HOST=localhost DB_PORT=32779 DB_USERNAME=postgres DB_PASSWORD=node26-fixture-only
export FILE_PROVIDER=local STRIPE_API_KEY=sk_test_fixture RESEND_API_KEY=re_fixture
export RESEND_FROM_EMAIL=fixture@example.invalid MEDUSA_TELEMETRY_DISABLED=1
python3 docs/upgrades/node-26/verify.py
export UPGRADE_IMAGE_TAG="$UPGRADE_CODE_SHA"
docker build --no-cache --progress=plain -f apps/medusa/Dockerfile -t "chef-node26-medusa:$UPGRADE_IMAGE_TAG" .
docker build --no-cache --progress=plain -f apps/storefront/Dockerfile -t "chef-node26-storefront:$UPGRADE_IMAGE_TAG" .
```

`rehearsal.py` records fixture commands and row/ledger/schema snapshots. Its explicit
`/tmp/private-chef-node26-baseline` and `...-final` archives and tool paths match
this run; recreate those from the base/candidate SHA first. It refuses to create
an already existing fixture database. `smoke.py` requires that rehearsal and its
`node24-browser-seed.log` in the evidence directory. Both images run as UID 1000
on an internal Docker network; HTTP ports bind loopback. It checks native SWC,
health, Admin login/access rejection, Admin assets, native cart pricing, storefront
home/product/checkout SSR and repeated HTTP navigation. Checkout uses provider-free
synthetic fixtures. Smoke overrides migration-on-start; migrations run only via
the explicit disposable rehearsal. Smoke removes its app containers and network;
remove task-owned PostgreSQL/Redis containers after all checks.

## Remaining release gates

The separate [Medusa release gates](../medusa-2.22.6/README.md) are unchanged.
Reviews stay disabled (`plugins: []`); compatibility tests do not prove an enabled
plugin migration. No live Stripe, Google Calendar or Resend proof. No sanitized
production-volume rehearsal, deployment or production migration was performed.
HTTP SSR checks do not prove browser hydration; the earlier intermittent browser
`reading 'result'` error remains unproven/unfixed. Registry digest pinning fixes
the base filesystem; existing apk/npm build-time downloads are not hermetic.
Arbor BTS-20 had no direct connector in this session; the PR handoff includes an
Arbor-ready update for the parent to post.
