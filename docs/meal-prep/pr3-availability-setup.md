# Meal Prep V1 PR 3: Availability extension and chef service setup

Authority: [full Requirements Contract v1.1, artifact revision 4](requirements-v1.1-r4.md), provided in full before edits with the reconciled architecture and stacked delivery plan. Assigned [BTS-5 objective](https://arborthreads.com/threads/thr_d00889d6-e4c7-4ec8-a9de-262e7dc76c98/extend-availability-and-shared-conflict-protection): extend existing Availability and shared conflict protection. ChatGPT publishes the completed handoff to Arbor; this agent does not publish there.

## Verified stack

- Origin: `git@github.com:PabloJVelez/private-chef-template.git`.
- Isolated worktree: `/home/openclaw/.t3/worktrees/private-chef-template/feat-meal-prep-v1-availability-setup`.
- Base branch: `feat/meal-prep-v1-shared-scheduling`, [PR #17](https://github.com/PabloJVelez/private-chef-template/pull/17).
- Exact verified base: **`e8d1acc59df55ab4b7185dad50558cb718382bf1`**. Clean starting HEAD, live remote branch, GitHub PR head, and merge-base matched before edits.
- Foundation ancestor: **`d301128119e3c7667a48b48ca3a4f4070e14152a`**, [PR #16](https://github.com/PabloJVelez/private-chef-template/pull/16). Both predecessor PRs remain unmerged.
- Head branch: `feat/meal-prep-v1-availability-setup`. Exact resulting head and PR URL are recorded in the PR body and final handoff; this file cannot embed its own commit hash.

No merge, deploy, production write, real provider action or product-policy decision is authorized or performed. Existing false meal-prep feature controls remain false. Configuration editing does not activate meal-prep administration/approval commands, customer access, scheduling, billing, autopay or dispatch.

## Delivered behavior

The existing `/app/settings/availability` page now includes a **draft** meal-prep setup section. There is no new standalone Availability destination.

- Independently enabled in-home, delivery and pickup preferences; all eight combinations, including all off, are valid drafts.
- Independently supported individual dishes/quantities, packages, chosen-menu visits and tailored-plan requests; all sixteen style combinations are valid drafts. No price formula or payable quote is inferred.
- Per-method proposed weekday windows and explicit dated windows in the existing Availability timezone. Empty dated windows mean only no proposed windows; no precedence, closure override, notice applicability or customer eligibility is evaluated.
- Radius-around-address input with an explicit distance/unit, and a ZIP/ZIP+4 list. Syntax and finite positive distance validation are input checks, not address deliverability validation. Both drafts can be stored for review; neither is active. Storage does not decide whether radius and ZIP rules can coexist or whether to use union/intersection. There is no paid out-of-area path or fee field.
- Explicit draft chef work intervals and purposes: in-home, preparation, delivery/travel and handoff. The editor labels these timestamps UTC. Drafts are saved only as configuration and do not create or replace reservations. No serving-to-duration formula or pickup-as-appointment rule exists.
- Admin-only review of actual reserved meal-prep work from PR #17's shared reservation layer, with linked-occurrence counts. Multiple links still represent one reserved block. Read failures are errors rather than an apparently empty schedule.

**Order/serving summary limitation:** the foundation module contains opaque draft revisions, not validated approved occurrence menus, order facts, serving totals or method/date approval snapshots. This PR deliberately reports order/serving totals as **unavailable (`null`), never zero**, and does not mislabel linked occurrences as orders. The review panel explains manual assessment and unknown totals. Later occurrence/menu/order PRs must supply trustworthy facts for advisory date/window summaries. This is a staged implementation boundary, not completed numerical order/serving reporting. Adding another mutable order model or interpreting unapproved JSON here would bypass those later designs. Counts do not drive acceptance or rejection.

## Persistence, authorization and concurrency

The existing Availability model/schema/cleaner/workflow/SDK carry an additive nullable `meal_prep` JSON snapshot and integer `version`.

- Existing rows migrate to version 0 with `meal_prep = null`; their timezone, hours, date exceptions, notice rules, Google mode and timestamps remain unchanged.
- The admin API requires an authenticated Medusa `user` actor and a nonnegative expected `version`. Built-in admin authentication remains in place. Customer/anonymous actors cannot read the setup or review data or save settings.
- This installation follows existing Availability's single-chef admin authority and fixed `chef-default` resource. Actor IDs and JSON cannot choose another chef/resource. It does not introduce multi-tenant chef membership.
- First save uses expected version 0 and creates version 1. Each successful update advances the persisted version once. Competing first saves or updates yield one success and an HTTP 409 for the stale writer. Missing versions and unsupported top-level fields return 400. Old open admin bundles/API clients must reload and send the version; accepting unversioned writes would defeat protection.
- A before-update database trigger advances revisions for generated CRUD and direct SQL updates too. The service also explicitly advances revisions, which is consistent with the trigger and makes its SQL contract explicit.
- Method maps, dates, area inputs and work plans replace the complete submitted snapshot. Deleted entries do not return through Medusa's JSON deep merge. An omitted `meal_prep` field preserves saved setup for versioned legacy callers; explicit null clears it. Existing omitted/null notice-rule behavior is preserved, while `[]` still intentionally removes notice rules.
- A stale save preserves the user's draft. The explicit reload action is labeled as discarding the draft. Save/refetch responses do not silently replace edits made while a request is in flight; the new baseline revision is carried forward. Discard restores the saved baseline, including all meal-prep fields.
- PR #17's internal `replaceUnlinkedWorkBlock` now requires `expectedAvailabilityVersion` instead of the prior millisecond timestamp token. It holds the same shared row lock and validates the current integer revision. This detects direct changes even if their timestamp is unchanged. There are still no public scheduling callers or linked-occurrence reschedule commands.

No quotas, remaining-capacity fields, capacity rejection, customer windows, prices, fees, groceries, payment terms, pickup-location validation, recurrence horizon or Google failure policy are added. Array sizes and the 31-day review query bound are technical input/read bounds, not order limits or a recurrence materialization horizon.

## Migration and rollback

`availability/Migration20261030000300` adds `version`, `meal_prep` and the revision trigger to the existing table. No source event, reservation, order or menu row is modified. No new module or module-order dependency is introduced.

Across the stack, PR #16's foundations and PR #17's shared integration migration remain required. On a fresh installation Medusa runs Availability's migrations in module order before the shared scheduling module; the full runner verified this order. On upgrade from PR #17, only the new Availability migration applies. Migrate before running code that reads these columns or uses integer Availability revisions.

Downgrade locks the settings table and refuses any non-null meal-prep configuration, including soft-deleted rows and empty saved setup. An empty downgrade removes only these additions; it does not modify the legacy schedule or shared reservations. Once setup exists, prefer a reviewed forward fix and preserve configuration. Do not discard user drafts just to make rollback pass. Do not run the new application against the pre-PR-3 schema.

Migration/table locks may briefly delay settings saves. No production-volume rehearsal was performed. Schema-generation tools must retain the manually maintained trigger; generated test tables alone are not proof of migration behavior. PostgreSQL owners remain a trusted maintenance boundary, as in PR #17.

## Requirements and evidence

- **R01/R20 → T01/T14:** full contract provenance, unchanged false feature controls, strict unsupported-policy-field rejection, documented D02/D03/D12 gates; review the policy boundary before activation.
- **R02/R03 → T02/T03 (configuration only):** `meal-prep-setup.unit.spec.ts` exercises all independent method/style combinations. Rendered Availability tests cover editing, saving, discard and version propagation. Actual customer method/style flows belong to later layers.
- **R07 → T02/T14 (primitives only):** radius/address/unit and ZIP syntax/duplicates, draft roundtrip, removing radius and clearing ZIPs. No geographic eligibility claim or invented combination semantics.
- **R08 → T04:** shared PostgreSQL test links 30 occurrences to one reservation, reads the manual-review facts and verifies adjacency. The API returns null order/serving totals. No count-based decision exists. Numerical order/serving aggregation awaits validated later records, as described above.
- **R09 → T06/T07:** SDK/HTTP/workflow save races, full nested deletion roundtrips, global time-off preservation, same-row settings/work-block serialization and stale integer revision rejection. Existing Availability, Google, navigation and storefront rendered regressions pass.
- **R19 → T07/T12/T13:** inherited shared-time/private-event PostgreSQL races and commerce unit regressions; populated migration preserves private-event Availability, direct-write revision invalidation, transactional downgrade refusal and empty rollback/reapply. No private-event commerce implementation changed.
- **Authorization → T11 subset:** route tests reject anonymous/customer/empty actors before service resolution, reject chef/resource injection, and bound review requests. Actual built-server HTTP smoke verifies admin authentication, anonymous rejection, version validation and stale conflicts.

D02 (delivery combination/address/out-of-area), D03 (locations/windows/closure/notice/fees), D12 (external-calendar assurance), and D04/D05 (pricing/grocery/payment terms) remain unresolved. All other D01–D12 gates from the full contract also remain unchanged. There are no product-policy deviations. Automatic order/serving caps and spending caps remain excluded, not pending decisions.

## Validation — 2026-10-30

Toolchain: **Node 24.22.1**, **Yarn 4.5.0**. The shell default was 24.16.0; all installs, tests and builds used the isolated 24.22.1 runtime. Existing lockfile installed with `--immutable`; dependencies and lockfile unchanged. PostgreSQL **16** ran in a newly created disposable Docker container bound only to loopback, separate from existing development services.

- Medusa unit/rendered suite: **19 suites / 192 tests passed**.
- Storefront unit/rendered suite: **2 suites / 15 tests passed**.
- Focused real PostgreSQL: **5 suites / 51 tests passed, none skipped** (Availability save, setup migration, shared scheduling, legacy Availability concurrency, meal-prep foundations). Shared scheduling was rerun after switching to integer revisions: **27 tests passed**.
- Standalone legacy migration regressions: **1 suite / 4 tests passed**.
- Workspace typechecks and builds: **both workspaces passed**, including final Medusa checks after implementation changes; unchanged storefront results reused the successful Turbo cache.
- Full Medusa migration runner: fresh application install, empty setup rollback and reapplication passed using `--skip-scripts --skip-links`; no new links/data scripts are introduced here.
- Built-server authenticated HTTP smoke on the disposable database: anonymous GET/POST/review rejected; admin login, initial setup save/load, stale 409, missing version 400, shared review with null totals passed. Saving explicit pickup windows and a draft work plan on a globally closed date did not create reservations or change global time off.
- `git diff --check` passed.

One inherited simultaneous GiST insertion test encountered PostgreSQL `40P01` (deadlock victim), a valid concurrent exclusion outcome alongside `23P01`. The test now verifies exactly one surviving source/reservation, no losing source, and deterministic `23P01` rejection when the loser retries. No runtime retry or policy changed.

Rendered React/JSDOM tests exercise the real Availability page. T3 browser automation could not start: `This host blocks the sandbox T3's browser runs in (AppArmor on Ubuntu 23.10+).` No live-browser visual acceptance is claimed. Existing warnings include React `act`, VM modules, configured Jest force-exit, dependency peers, local test infrastructure, and Turbo's Medusa output warning. No hosted CI, real Stripe/Google, checkout E2E or production-scale migration result is claimed.

Repeat using Node from `.nvmrc`, Yarn 4.5.0 and an explicitly disposable PostgreSQL server:

```bash
yarn install --immutable
yarn workspace medusa test:unit
yarn workspace storefront test:unit
MEAL_PREP_TEST_DATABASE_URL="$PR3_TEST_URL" AVAILABILITY_TEST_DATABASE_URL="$PR3_TEST_URL" \
  yarn workspace medusa test:integration:http --runTestsByPath \
  integration-tests/http/availability-save.spec.ts \
  integration-tests/http/availability-setup-migration.spec.ts \
  integration-tests/http/shared-scheduling.spec.ts \
  integration-tests/http/availability-concurrency.spec.ts \
  integration-tests/http/meal-prep-foundations.spec.ts
TEST_DATABASE_URL="$PR3_TEST_URL" yarn workspace medusa jest --runTestsByPath \
  integration-tests/availability/legacy-migration.spec.ts --runInBand --forceExit
yarn typecheck
yarn build
```

The module integration runner creates/drops its own named database; the remaining PostgreSQL suites use isolated random schemas. Never point these variables at an existing application/production server. Full-runner rehearsal used a separate empty database, `NODE_ENV=test`, `FILE_PROVIDER=local`, and placeholder provider keys. The built server ran from `apps/medusa/.medusa/server`, with test resources only.

## Handoff

Review this additive migration, the stricter versioned save contract, and the staged summary/work-plan boundaries. Keep all stack layers unmerged and undeployed. PR 4 branches from this PR's exact committed head; restack if PR #17 changes and rerun affected tests.

ChatGPT should transfer this document and the exact PR/SHAs/results to BTS-5. Carry D02/D03/D12 (and pricing gates) to BTS-2 through the authorized participant; no decision is inferred from these editable drafts. Later PRs must connect approved occurrence/order/serving facts to the manual review panel and provide approval-time validation/reservation of work plans before any production scheduling activation. Final integrated owner testing still requires all three fulfillment methods and all four recurrence patterns, reviewed policies, disposable provider resources and explicit merge/deployment authorization.

## PR review correction: exclusive conflict reload (2026-10-30)

The review reproduced a lost-update path when an edit during explicit reload retained
an entire stale snapshot but adopted the newly fetched revision. Reload now locks
editing, Save, Discard and duplicate Reload actions synchronously. A successful
reload resets only to the fetched snapshot; failure preserves the draft and revision,
shows an error toast and releases the lock for retry. Editing during Save is unchanged.

Rendered regression coverage attempts edits, submission, Discard and repeated Reload
while the fetch is pending, then verifies another editor's global time off and meal-prep
configuration are retained in the next save. Failure coverage verifies the unchanged
draft/revision and a successful retry.

Verification for this correction (Node 24.16.0, Yarn 4.5.0):

- Medusa: 19 suites / 193 unit and rendered tests passed.
- Disposable PostgreSQL 16: 5 suites / 51 integration tests passed, none skipped,
  including stale-save 409 races, migration preservation and shared scheduling.
- Medusa and storefront typechecks passed.
- Medusa backend/admin and storefront client/server production builds passed.
- No real-browser two-tab check or full migration-runner rehearsal was repeated.
  The review runtime is older than the repository's pinned Node 24.22.1.

No merge, deployment, feature activation or downstream-stack restacking is included.
PR 4 remains based on the previous PR 3 head and needs this correction incorporated
before its next integrated review.
