# Meal Prep V1 PR 4: dated offers, intake and customer authorization

Authority: the full [Requirements Contract v1.1, artifact revision 4](requirements-v1.1-r4.md), supplied in the session before edits. The reconciled architecture is subordinate proposed guidance. Assigned Arbor objective: **Meal Prep Services — dated offers and menus thread and customer/admin workstream**: implement dated offer revisions, all four selection-style requests, servings, conditional intake, and ownership enforcement. ChatGPT transfers this handoff to Arbor; this agent does not publish there.

## Verified stack and review gate

- Origin: `git@github.com:PabloJVelez/private-chef-template.git`.
- Isolated worktree: `/home/openclaw/.t3/worktrees/private-chef-template/feat-meal-prep-v1-dated-offers-intake`.
- Base: `feat/meal-prep-v1-availability-setup`, open [PR #18](https://github.com/PabloJVelez/private-chef-template/pull/18).
- Exact parent: **`6a5f44235eefa00319a394b4e05021fb3d04b225`**. Initial clean HEAD, local parent, live remote branch, GitHub head and merge-base all matched before edits. Existing Availability at `/app/settings/availability`, its migration fix, and stack ancestry were verified.
- Ancestors: shared scheduling `e8d1acc59df55ab4b7185dad50558cb718382bf1`; foundations `d301128119e3c7667a48b48ca3a4f4070e14152a`.
- Head: `feat/meal-prep-v1-dated-offers-intake`. The resulting exact SHA and PR URL are recorded in the GitHub PR and final handoff, avoiding a self-referential commit hash in this file.

PR #18 is provisional and under independent review. Its code is not treated as approved. **If its head changes, restack this branch and rerun the affected tests before downstream review or merge.** No parent branch modification, merge, deployment, production change, real provider action or product decision is part of this work.

## Scope and source files

Before edits, the session enumerated R03–R07, R14/R18, regression protections R08/R09/R19, D02/D03/D04/D05/D10 gates, migrations and the tests below. No independent implementation requires resolving a product-policy conflict.

- `apps/medusa/src/modules/meal-prep/capture-contracts.ts`: strict domain schemas, dated membership and method/style validation, public-content projection.
- `capture-storage.ts` in the same directory: transactional ownership, immutable revision writes, reads and review-time revalidation.
- `service.ts`: internal command methods; `models/records.ts`: three additive Medusa models.
- `migrations/Migration20261030000400.ts`: tables, identity/reference/version guards, immutable history and safe downgrade.
- `__tests__/capture-contracts.unit.spec.ts` and `capture-fixtures.ts`: domain and privacy fixtures.
- `apps/medusa/integration-tests/http/meal-prep-capture.suite.ts`: actual Medusa service, PostgreSQL, authorization, races and migration tests. Imported by `meal-prep-foundations.spec.ts` to share one Jest realm with the existing module suite.

No UI, HTTP routes, jobs, private-event implementation, shared reservation implementation, Availability implementation, dependency, lockfile or feature-control flag is changed.

## Delivered domain behavior

**Offers.** An offer revision contains an explicit calendar date or a seven-day interval beginning on an explicitly supplied date, immutable dish descriptions, optional shared base-price revision references, and named package/menu request options. There is no inferred Monday/Sunday week start, clock/timezone conversion, pricing unit, price amount or method-specific price. The chef supplies catalogue content; wiring an existing menu editor to these snapshots is later integration work. Price references are provenance placeholders, not verified prices or payable amounts.

Offer roots identify the current revision. A new revision never edits prior dish content. Selection validation requires the exact current offer revision and membership on the requested date. A historical request remains readable after offer changes, but it must be revisited before a later approval. This is dated content validation only; it does not assert that a date, address or fulfillment window is available.

**Four request styles.** Individual dishes, package requests, chosen-menu visits and tailored-plan requests are distinct typed structures. Every selected dish records positive integer `quantity` and `servings` independently. Neither field implies a billing unit or a multiplication formula. Large serving values are accepted within JavaScript safe-integer representation; there is no business capacity threshold.

Individual, package and chosen-menu requests include dish lines. Package/menu IDs must exist in the exact offer; selected lines must belong to that option. A requested subset is recorded for chef review and does not establish final package composition/pricing. A tailored-plan request can contain a private brief with no dish lines yet; any supplied lines must be offered for the requested date. All four remain requests, never approved menus, orders or quotes.

Method/style enablement is read from PR #18's draft Availability configuration, under a shared database row lock. Its version is recorded with each selection snapshot. This honors the chef's independent choices without activating customer-facing eligibility. The single-chef scope remains `chef-default`, as in the parent. Multi-tenant chef membership is not invented.

**Intake.** General allergies, dietary restrictions, preferences, household size and portion preferences apply to all methods. In-home revisions add address, home access, equipment, storage and containers. Delivery revisions use address and separate delivery instructions. Pickup intake does not accept home-access or kitchen fields. Nullable fields explicitly support unanswered drafts; this PR does not establish a minimum-completeness or safety-certification policy. Empty lists mean no recorded entries, not a medical assertion that no allergies exist.

Each selection references an immutable intake revision from its exact household with a matching fulfillment method. A method change therefore requires a newly applicable intake revision for review. Previous private intake and requests remain immutable. No household or intake content enters offers, calendars, payment metadata, notifications or general logs through these commands.

## Internal API and authorization contract

All three service methods are **internal**. No route, public login/link mechanism or production activation is supplied. Callers must obtain `MealPrepPrincipal` from a trusted identity resolver and must never deserialize it from request JSON. D10 still blocks that production adapter. Generated Medusa CRUD methods are privileged persistence plumbing and must not be exposed as APIs.

- `saveCapture(input, principal, context?)`: create a root with expected version 0 or append a revision with the current expected version. Input includes capture ID, idempotency key, stable customer/household identity fields and one typed body. Only trusted chef commands enroll household ownership or author offers. Customers may revise their own intake and submit/revise their household's selection requests. This is an ownership kernel, not an invitation, account or household-sharing policy.
- `readCaptureSnapshot(revisionId, principal, context?)`: return an exact historical private revision only after chef/customer ownership and active household checks. A customer cannot use this private reader to read offer records; future public offer reads require a separately reviewed adapter and the explicit content projection.
- `revalidateSelectionRequest(revisionId, agreedDate, principal, context?)`: chef-only revalidation of the latest request, agreed date, current offer/intake and current method/style enablement. Returns revision/version/Availability-version references, **not an approval or general eligibility result**. PR 5 must pass the trusted occurrence's agreed date and share the approval transaction through `context.transactionManager`; checking in a completed transaction is not an atomic approval.

Errors use generic codes: `INVALID_INPUT`, `NOT_FOUND`, `STALE_VERSION`, `IDEMPOTENCY_CONFLICT`, `STALE_REFERENCE`, `INVALID_SELECTION`, `METHOD_OR_STYLE_DISABLED`. Submitted validation values are not interpolated into error messages. Cross-owner, nonexistent and inactive private references all return `NOT_FOUND`. No capacity error exists.

Authorization happens before receipt lookup. Identical retries by the same actor return the saved result even after the initial expected version becomes stale. Changed payloads under that key conflict; other actors cannot obtain that receipt. Capture creation is serialized with a PostgreSQL advisory transaction lock; existing roots also use row locks. Shared reference/settings locks prevent races with offer, intake and enablement edits. Snapshot, root version and receipt commit or roll back together.

The request snapshot retains immutable offer/intake foreign references, so later menu construction can read the exact dish content without relying on mutable catalogue rows. It does not yet bind or confirm an occurrence. PR 5 owns that association and separate arrangement/menu approvals. This layer never overwrites confirmed occurrence records or existing approvals.

Private bodies exist only in private snapshot rows. Receipts record actor/reference metadata, a request hash and the reference-only result, serving as durable command audit. They do not copy intake or tailored briefs. There are no capture outbox emissions or external side effects. Database owners, privileged internal CRUD and infrastructure administrators remain trusted maintenance boundaries; database access/logging must remain restricted. Credential expiry/revocation tests for accounts or scoped links await D10. Soft-deleted household access and replay denial are tested now.

## Migration and recovery

`meal-prep/Migration20261030000400` adds:

- `meal_prep_capture`: immutable kind/chef/customer/household identity and monotonic version.
- `meal_prep_capture_snapshot`: append-only typed snapshot envelopes, contract/actor provenance, offer/intake foreign references and Availability version.
- `meal_prep_capture_receipt`: append-only actor-scoped idempotency receipts and command audit.

Foreign keys and triggers prevent cross-household references, identity rewrites, stale referenced heads and mutation/deletion of history, including through generated CRUD. Domain payload validation is the command layer's responsibility; raw/generated inserts are not a replacement for it. No arbitrary JSON becomes an approved or chargeable menu.

The migration follows foundation migration `20261030000100` and uses its immutability function. It has no cross-module migration dependency and touches no legacy rows. Medusa's existing module registration order was rehearsed on a fresh database. Upgrade from the PR #18 schema was rehearsed with existing Availability and foundation data intact.

Downgrade takes exclusive locks and refuses any populated capture root, including soft-deleted roots. Empty downgrade and reapplication work. Preserve populated private history with a reviewed forward fix; do not erase it to force a rollback. No production-volume rehearsal was performed. Schema-generated test tables alone do not install these manual database guards.

## Requirement-to-test mapping

- **R01/R20 → T01/T14:** full contract provenance, strict unknown-field rejection, unchanged false runtime flags, no customer adapter or chargeable path. D01–D12 remain unresolved as listed in the contract; no new product-policy deviation.
- **R03/R04 → T03:** all four request styles, explicit date/week boundaries across year-end/leap day, offered dish/option references, independent servings/quantity, stale offer/intake/request rejection, immutable history, agreed-date revalidation, and enabled style checks. Unit suite plus PostgreSQL capture suite.
- **R05/R06 → T03/T08 subset:** shared base-price reference per offered dish, no per-method amounts, no price calculation, no implied grocery/payment terms; strict rejection of price/charge fields. No payable-quote validation or live payment claim.
- **R07 → T02/T14 subset:** delivery intake is supported, but D02 area combination/address validation/out-of-area handling and D03 location/windows remain gated. No delivery-area or fee calculation is added.
- **R14 → T02/T11:** all three intake shapes, rejection of in-home fields on other methods, method/intake mismatch, historical snapshots, private projection rejection and generic validation errors.
- **R18 and ownership → T11:** customer/chef scoping, same-owner different-household reference rejection, forged references, inactive households, unauthorized receipt replay, immutable identity/direct-write protection and reference-only audit. Card fields are rejected; no provider action is reachable.
- **R08/R09/R19 → T04/T06/T07/T12/T13 regression:** 20 large-serving requests do not cause count rejection or alter global time off; capture commands do not create reservations. Existing shared-time/private-event races, Availability save/version/closure behavior, Google/Availability rendered tests and event-ticket tests pass. No private-event implementation change.

## Validation — 2026-10-30

All installs/tests/builds used **Node 24.22.1**, **Yarn 4.5.0**, with immutable dependency installation. Shell default Node 24.16.0 was not used for validation. PostgreSQL **16** ran in a newly created disposable container on loopback port 55439, separate from PR #18's review database and other development services.

- Medusa unit/rendered: **20 suites, 211 tests passed** (19 new capture contract cases).
- Storefront unit/rendered: **2 suites, 15 tests passed**.
- Real PostgreSQL: **5 Jest files, 68 tests passed, none skipped** (17 new capture cases plus 51 inherited cases). Includes actual module loading, creation/update retry races, concurrent offer/settings edits, authorization, migration guards and private-event concurrency.
- Additional legacy migration regressions: **4 tests passed**.
- Both workspace typechecks and builds passed.
- Full Medusa migration runner: fresh installation, empty capture rollback and reapplication passed using test-only configuration and `--skip-scripts --skip-links` for migration. Populated upgrade and rollback refusal run in the PostgreSQL suite.
- `git diff --check` passed.

Initial combined PostgreSQL execution exposed a Medusa cached DML/Jest cross-realm loader error (`Method Map.prototype.set called on incompatible receiver #<Map>`). The new suite now shares the foundation suite's Jest realm via an import; the complete combined command then passed. No runtime workaround or skipped case was introduced.

Rendered tests exercise existing Availability and storefront event-request components. This PR has no UI change or new customer/admin page, so no new browser flow is claimed. No hosted CI result, full checkout E2E, real Stripe/Google test, selected customer credential mechanism or production-scale migration result is claimed. Existing React `act`, experimental VM-module, Jest force-exit, dependency-peer and Turbo output warnings remain.

Repeat on the exact head with Node from `.nvmrc` and an explicitly disposable PostgreSQL server:

```bash
yarn install --immutable
yarn workspace medusa test:unit
yarn workspace storefront test:unit
MEAL_PREP_TEST_DATABASE_URL="$PR4_TEST_URL" AVAILABILITY_TEST_DATABASE_URL="$PR4_TEST_URL" \
  yarn workspace medusa test:integration:http --runTestsByPath \
  integration-tests/http/meal-prep-foundations.spec.ts \
  integration-tests/http/shared-scheduling.spec.ts \
  integration-tests/http/availability-save.spec.ts \
  integration-tests/http/availability-setup-migration.spec.ts \
  integration-tests/http/availability-concurrency.spec.ts
TEST_DATABASE_URL="$PR4_TEST_URL" yarn workspace medusa jest --runTestsByPath \
  integration-tests/availability/legacy-migration.spec.ts --runInBand --forceExit
yarn typecheck
yarn build
```

The module runner creates/drops its own named database; other suites use random schemas. Never point test URLs at an existing application or production server. The full migration runner used a separate empty application schema, `NODE_ENV=test`, `FILE_PROVIDER=local` and placeholder provider keys, with no provider requests.

## Follow-up handoff

1. ChatGPT publishes this document, exact head/base SHAs, PR URL and validation results to the dated offers/menus and customer/admin workstreams. Carry D04/D05 pricing and D10 customer-access decisions to BTS-2; D02/D03 still block fulfillment eligibility. No access mechanism, price formula or address policy is inferred here.
2. Independent review must examine ownership enforcement, immutable/reference guards, migration safety and the provisional PR #18 configuration dependency. Keep the stack unmerged/undeployed. Restack and retest after any parent change before review/merge.
3. PR 5 binds exact request/offer/intake revisions to occurrences, revalidates within approval transactions, constructs separately approved immutable menus, and preserves pending-versus-confirmed state. An intake or offer revision does not itself reapprove or rewrite an occurrence. All four recurrence patterns remain required later.
4. Later reviewed adapters must derive trusted principals, preserve private DTO separation, add account/link credential tests and implement approved policy versions before any customer access, availability eligibility, billing or payment activation. Existing menu-editor integration, household-sharing/access lifecycle, intake-completeness decisions and final package composition remain outside this internal request layer.
5. Final stack-tip owner testing, disposable provider resources, hosted CI and production-scale migration rehearsal remain gates from the delivery plan. This PR does not authorize merge, deployment or feature activation.
