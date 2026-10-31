# Meal Prep V1 PR 5 — Arrangements, recurrence and approvals

Authority: [full Requirements Contract v1.1, artifact revision 4](requirements-v1.1-r4.md), supplied in the prompt before edits. The reconciled BTS-3 architecture is subordinate guidance. Assigned objective: [BTS-6 — Implement household arrangements, recurrence and approvals](https://arborthreads.com/threads/thr_3af09b29-8c2b-457d-be82-048f8afec2bd/implement-household-arrangements-recurrence-and-approvals). ChatGPT publishes this handoff to Arbor; this session does not publish there.

## Verified stack

- Origin: `git@github.com:PabloJVelez/private-chef-template.git`.
- Worktree: `/home/openclaw/.t3/worktrees/private-chef-template/feat-meal-prep-v1-arrangements-approvals`.
- Base: `feat/meal-prep-v1-dated-offers-intake`, open [PR #19](https://github.com/PabloJVelez/private-chef-template/pull/19).
- Exact parent: **`a973be19824f0d14cd8ed0f3a49fe29de181f810`**. Initial HEAD, local parent, live remote parent and GitHub PR #19 head all matched. Merge-base matched. Initial working state was clean; the head branch had no remote ref.
- Head branch: `feat/meal-prep-v1-arrangements-approvals`. Final SHA and PR URL are supplied in the delivery response and PR, avoiding a self-referential commit hash here.
- No merge, deployment, production migration or provider action. All runtime feature flags remain false. If the parent changes, restack and rerun affected checks before review/merge.

Before edits, the session identified contract v1.1/r4, R10–R13, R09/R19 regressions, D03/D04/D05/D06/D07/D09/D10 dependencies, an additive approval-state migration, recurrence/DST tests, PostgreSQL races, suites, typechecks and builds. No unresolved product decision was treated as approved.

## Implemented internal boundaries

`recurrence.ts` validates and generates all four patterns: weekly fixed, fortnightly, multiple independently identified weekly visits (including different visits on one day), and irregular custom dates. Weekdays use ISO 1–7. A weekly/fortnightly anchor is explicitly the agreed first visit date, which must match its slot weekday; fortnightly parity is calendar days from that date, never ISO week numbers. Multiple-weekly anchors are lower bounds, with each weekday independently matched.

Both inclusive local-date bounds are mandatory. There is no implicit horizon, end policy, replenishment job, series confirmation or partial-conflict strategy. Generation returns **candidates**, not reservations. Stable SHA-256 keys encode arrangement, immutable recurrence revision, slot identity and original local date; overlapping bounds and retries reproduce the same occurrence ID. Generation never copies menus. Gap/fold candidates retain their local intent and all possible UTC instants; no DST choice is made. The internal single-candidate recording command also requires an explicit date and slot. Database identity uniqueness prevents a second identity or regeneration over an existing occurrence, including soft-deleted identities.

`approval-contracts.ts`, `approval-storage.ts` and the module service provide trusted internal commands:

- Propose an arrangement for an owned household and explicit fulfillment method; chef approval checks enabled capabilities and is recorded once. Approval does not reserve time or approve any menu.
- Persist an independently identified candidate against that exact approved arrangement revision. Each begins with no menu, quote approval, payment or fulfillment action.
- Submit and separately approve/reject each initial menu/quote **review snapshot**. Selection, household, current offer, method/style enablement and relevant date are revalidated in the same transaction as chef approval. An unfinished tailored request with no dish outcome cannot become an approved menu.
- Submit menu/portion, date, skip or pause requests as immutable change revisions. Confirmed details remain unchanged while pending or rejected. Same-quote menu/portion changes can be approved after revalidation; changed prices, skip/reschedule application and pause effects return explicit policy dependencies. No automatic financial adjustment exists.
- Set an explicit chef selection deadline and flag a missed selection. An on-time pending submission is not missing. The flag and reference-only `meal_prep.selection_follow_up` outbox intent commit once; no prior menu is repeated, no dish substituted, no booking cancelled, and no payment is created. Outbox dispatch remains disabled; actual chef/customer notification delivery belongs to later integration.
- Link an existing, explicitly chef-planned work block with occurrence state, audit and outbox in one transaction. The shared scheduling module owns its table writes. Settings → block → occurrence locks preserve coherent Availability validation and the existing link trigger order. In-home work must be exclusive and start at the candidate's agreed instant. Delivery/pickup may link shared preparation/delivery/handoff work; no order count creates a quota or a new reservation.

Every command requires an expected aggregate version and actor-scoped idempotency key. Identical retries return their durable result even after version changes; conflicting reuse fails. Authorization precedes receipt lookup and private reads. Household ownership/revocation is checked, including for chef-supplied selection references. The trusted principal interface remains independent of the production customer access mechanism. No new public HTTP endpoint or login mechanism is added.

The immutable menu revision includes its exact quote review, so the approval refers to both contents atomically. `unknown` remains unknown. `exact_review` uses integer minor units and explicit currency/provenance; **it is not a payable quote or a claim that D04/D05/D11 are resolved**. There is no pricing formula, grocery default, billing obligation, payment email, subscription, spending cap, charge, refund or fulfillment state transition. PR 6 must introduce its separate policy-validated payable quote/billing boundary; it must not charge by scanning these review approvals. It must also integrate payment state into change checks before any payment capability is enabled.

## Reservation and policy limits

The PR #17 linked-block freeze is unchanged. Every linked movement/release still fails at the database boundary. The inherited `replaceUnlinkedWorkBlock` transaction remains available and is regression-tested for exclusion conflicts, rollback preserving the original reservation, coherent settings, stale writers and adjacent half-open intervals. This PR adds transactional work linking, **not linked occurrence reschedule execution**.

No new multi-occurrence replacement path is claimed. Implementing it needs authorized decisions for every affected occurrence plus an atomic replacement transaction, financial-state checks, and D09 series/conflict policy. Existing work links and the immutable original candidate cannot be rewritten through these commands. Future approved rescheduling must introduce a separate confirmed-schedule revision while retaining the original generation key. Applied skip tombstones are likewise deferred; existing durable identities cannot be removed or regenerated.

Explicit blockers for ChatGPT to request in BTS-2/Arbor:

- **D06:** cancellation/skip effects, paid reschedules, refunds and price adjustments. Requests/rejections work; applying these commercial transitions is blocked. This layer conservatively blocks all reschedule/skip application and quote-changing approvals rather than guessing whether an occurrence is financially eligible.
- **D07:** pause effects on existing occurrences, menus, work and payments. A pending pause changes none of them; applying a pause is blocked.
- **D09:** production horizon, end/replenishment, arrangement amendments affecting existing occurrences, partial conflicts, series confirmation and DST resolution. Bounded candidate generation is available; recurring production materialization and confirmation are absent.
- **D03/D12:** final method scheduling/closure and external-calendar assurance. Actual-work validation uses existing global hours/time off; it does not assert final method-window eligibility or strict prevention of external-calendar races.
- **D04/D05/D11:** production pricing, groceries/payment terms and platform fees. Exact review data does not unlock payment.
- **D10:** customer access and notification links. Ownership interfaces are implemented; customer production access stays disabled.
- **D01/D08:** payment timing/unpaid-service behavior remain untouched. No clock anchor, automatic cancellation or unpaid-service restriction is introduced.

These are scope limits, not silent policy deviations or a claim of complete V1 launch readiness. No UI was changed. Existing Availability remains the single administration destination. Existing event checkout, tickets, capture, calendar behavior and flags are unchanged.

## Migration and recovery

One additive migration: `meal-prep/Migration20261030000500.ts`, after `20261030000100` and `20261030000400` in the existing meal-prep module. It adds `meal_prep_approval_state`, append-only history, revision/current-version checks, household/arrangement ownership checks, occurrence approval requirements and immutable original candidate/method references. Existing records are not backfilled into approved workflow states. Generated persistence is internal plumbing; commands are the authorization boundary. Database owners retain maintenance privileges, including fixture-only truncate.

No shared-reservation or private-event constraint is changed. The shared scheduling module still migrates after all sources. Empty workflow-state downgrade is allowed; any approval-state history causes downgrade refusal, even if an aggregate is soft-deleted. Preserve history and use a forward migration for populated rollback.

## Requirement-to-test mapping

- **R10 → T05:** `recurrence.unit.spec.ts`: four patterns, year/53-week boundaries, inclusive bounds, stable IDs, multiple same-day visits, invalid definitions, New York gaps/folds, Lord Howe half-hour folds and Apia's skipped day. PostgreSQL candidate retries and visible unresolved-DST cases.
- **R11 → T05/T08:** `meal-prep-approvals.suite.ts`: arrangement versus per-occurrence approval, exact/unknown review snapshots, dated-offer revalidation, no payable side effects and no copied menu on the next occurrence.
- **R12 → T05/T06/T11:** pending/rejected menu, portion, reschedule, skip and pause isolation; approved same-quote revisions; D06/D07/D09 gates; stale chefs, duplicate requests, ownership, generated-writer guards, transaction failure rollback and immutable history.
- **R13 → T10:** explicit deadline, on-time pending submission, durable one-time missed-selection follow-up; no automatic schedule/menu/payment action.
- **R09/R19 → T06/T07/T12:** atomic work-link rollback, linked-block freeze, inherited `shared-scheduling.spec.ts` event/work races, settings races, atomic unlinked replacement and direct-write guards; Availability concurrency/save/migration suites and private-event unit regressions.
- **R01/R20 → T01/T13/T14:** full contract retained, disabled flags, documented dependencies, fresh and populated upgrade/downgrade checks. No policy-dependent behavior is presented as enabled.

## Executed verification

Toolchain: **Node 24.22.1**, **Yarn 4.5.0**, **PostgreSQL 16**, isolated loopback-only Docker container `meal-prep-pr5-test`. Existing lockfile installed with `--immutable`; no dependency or lockfile change. Host Node 24.16.0 was not used for checks.

- Medusa units: **21 suites / 221 tests passed**.
- Storefront units/rendered components: **2 suites / 15 tests passed**.
- Real PostgreSQL: **5 suites / 87 tests passed**, plus **1 legacy migration suite / 4 tests passed**; none skipped. The 87-test total includes 49 foundation/capture/approval cases after the last additions, and 38 shared-scheduling/Availability cases.
- Both workspace typechecks passed. Medusa backend/admin and storefront client/server builds passed.
- Actual `medusa db:migrate --skip-scripts --skip-links` passed on an empty disposable database. The exact parent was separately extracted with `git archive a973be19824f0d14cd8ed0f3a49fe29de181f810`, migrated through the actual runner, populated with an existing arrangement/draft fixture, then upgraded through the current runner. Existing source rows were compared by row-JSON hashes. The last-batch rollback/reapply rehearsal preserves parent records; populated workflow-state refusal is separately exercised by PostgreSQL tests.
- `git diff --check` passed.

The migration runners intentionally skip scripts/link synchronization; this layer adds neither. These fixtures are not production-scale data. No browser E2E, live Stripe/Google test, payment E2E, notification dispatch or full checkout E2E is claimed. Inherited warnings: Yarn peer dependencies, React `act`, Jest experimental VM/force-exit, and Turbo's Medusa output-path warning. Hosted CI is not claimed; repository workflow definitions are commented out.

Repeat with an explicitly disposable PostgreSQL URL only:

```bash
# Use Node from .nvmrc and the checked-in Yarn 4.5.0 runner.
yarn install --immutable
yarn workspace medusa test:unit
yarn workspace storefront test:unit
MEAL_PREP_TEST_DATABASE_URL="$PR5_TEST_URL" AVAILABILITY_TEST_DATABASE_URL="$PR5_TEST_URL" \
  yarn workspace medusa test:integration:http --runTestsByPath \
  integration-tests/http/meal-prep-foundations.spec.ts \
  integration-tests/http/shared-scheduling.spec.ts \
  integration-tests/http/availability-concurrency.spec.ts \
  integration-tests/http/availability-save.spec.ts \
  integration-tests/http/availability-setup-migration.spec.ts
TEST_DATABASE_URL="$PR5_TEST_URL" yarn workspace medusa jest --runTestsByPath \
  integration-tests/availability/legacy-migration.spec.ts --runInBand --forceExit
yarn typecheck
yarn build
```

The actual Medusa service and PostgreSQL transactions run in random disposable schemas. New approval tests share the existing foundation/capture Jest realm because Medusa caches generated DML metadata. Logs for this session are under `/tmp/pr5-verification`; the summary above is the durable review record.

## ChatGPT → Arbor handoff

Publish the final head SHA, PR URL, exact parent and this evidence to BTS-6. Request the named product decisions in BTS-2 separately; technical review does not approve them. Review this layer while disabled, including state guards, transaction lock order and non-payable quote semantics. Preserve the PR #17 linked-block freeze. PR 6 should branch from this layer's reviewed exact head, introduce policy-validated payable quote/billing state, and revalidate changes against that state. No merge or deployment until explicit owner review and final-stack local manual testing.

## Review correction: preserve initial selection time (2026-10-31)

The [automated review of `1afa94a`](https://github.com/PabloJVelez/private-chef-template/pull/20#pullrequestreview-5720219843)
found that replacing a pending menu overwrote `selectionSubmittedAt`. An on-time
submission could therefore become a missed selection after a post-deadline edit.

`selectionSubmittedAt` now means the first successfully validated menu submission
for the occurrence and is assigned only when null. Each replacement still advances
the aggregate version, points to the new immutable proposal and records its own
revision `created_at`; the initial timestamp is not reused as the edit timestamp.
Validation, expected-version checks, authorization and receipt replay precede this
assignment, and state/history/audit/outbox/receipt writes retain the existing atomic
transaction. No schema, policy, public API or activation change is needed. This is
an unreleased internal workflow correction, not a backfill or mutation of historical
approval snapshots from exploratory test runs.

Three controlled-clock real-PostgreSQL regressions first failed on the original
assignment, then passed with this correction. They cover first submission before,
exactly at, and one millisecond after the deadline, followed by a real capture
revision and pending-menu replacement after the deadline. Assertions cover:

- preserved first timestamp and the current replacement proposal;
- idempotent replacement retry and unchanged immutable earlier history;
- no missed flag, version change, audit, receipt or outbox write for on-time cases;
- genuinely late first submission still produces exactly one durable follow-up,
  with an idempotent retry and no automatic menu/schedule change.

Verification used a fresh detached checkout without reused `node_modules`,
**Node 24.22.1 / Yarn 4.5.0**, and a successful immutable install:

- **221 Medusa unit/rendered tests**, **15 storefront tests**, **90 PostgreSQL
  integration tests** across all five files, and **4 legacy migration tests**:
  **330 passed**, with no skipped tests in the full integration run.
- Both workspace typechecks and full production builds passed (Medusa backend/admin,
  storefront client/server). `git diff --check` passed.
- Full migration runner: fresh database passed; a separate database was migrated
  from exact parent `a973be19824f0d14cd8ed0f3a49fe29de181f810`, seeded with existing
  arrangement/revision/outbox/Availability rows, and upgraded. Row-JSON hashes were
  unchanged after upgrade and again after empty approval-state rollback/reapply.
  Populated approval-state downgrade refusal remains covered by the integration suite.
- Inspection completed the automated review's omitted dependency context: the
  requirements contract, service transaction/principal boundary, capture ownership
  and current-reference/date/method checks, shared-work locking and linked-block
  freeze, and disabled feature controls. No production route, subscriber or job
  invokes these approval commands or dispatches the follow-up topic.

The source and tests above were verified together before committing; the only
subsequent edit was this evidence document. No dependency or migration change was
introduced. Local logs are retained in `artifacts/pr20-verification-20261031` in the
agent workspace. This is fix verification and dependency inspection, not a new
independent full-PR review or a guarantee of the next review's numeric score.
No browser flow changed, so no browser E2E was repeated. No production-scale
migration, live provider, notification dispatch, payment or full checkout E2E is
claimed. Existing peer/toolchain warnings and unresolved product decisions remain.
Nothing was merged, deployed or activated.

## Second review: executable evidence and omitted dependency context

The [follow-up review of `9996f7e`](https://github.com/PabloJVelez/private-chef-template/pull/20#pullrequestreview-5720561794)
confirmed the timestamp correction and found **no new demonstrated defect**. Its
6/10 assessment is explicitly partial: no tool execution and omitted unchanged
sources, contract, dependencies and activation controls. No further application
patch is justified by that review. This follow-up adds the
[executable verification harness](../../scripts/verify-meal-prep/README.md) and an
exact-head GitHub Actions verification job, separate from the review queue.

### Applicable authority and dependency inspection

Authority remains Requirements Contract **v1.1 / r4**, exact parent `a973be1`.
R10–R13 require four recurrence patterns, arrangement approval distinct from each
occurrence's menu approval, pending changes preserving confirmed details, and
missed-selection follow-up without automatic repeat/substitution/cancellation.
R09/R19 preserve actual-chef-time protection and existing private-event behavior.
D06/D07/D09 still block price-changing/skip/reschedule/pause application and
production recurrence policies. D10 blocks production customer access. This
verification follow-up does not resolve or activate any product policy.

The dependency inspection at `9996f7e` covered these omitted sources and callers:

| Concern | Inspected implementation and observable regression |
| --- | --- |
| Capture ownership | `capture-storage.ts` authorizes chef/customer and nondeleted ownership; `ownedHousehold` checks household kind/customer; receipts are looked up only after authorization. `approval-storage.ts:validateMenu` separately compares the capture's customer and household with the occurrence before using chef scope for validation. Capture and approval suites reject cross-owner access/replay and revoked households. |
| Approval-time revalidation | `revalidateCapture` requires a selection, current capture version, and requested date equal to the occurrence date. `validateReferences` share-locks current Availability and offer/intake roots, rejects stale snapshots, checks the intake method, then invokes `validateSelection`. That function enforces enabled method/style, offer date and permitted dish/menu/package membership. Capture races wait for concurrent Availability/offer edits; approval of a superseded offer rolls back. |
| Transaction boundary | `service.ts:executeApprovalCommand` uses `@InjectTransactionManager`, validates principal/command and passes that same manager into approval storage. The same manager flows into capture validation and work linking; revision/state/audit/outbox/receipt writes share the transaction. Final-receipt fault injection rolls all writes back. No external provider action occurs inside it. |
| Scheduling guards | `Migration20261030000200` synchronously projects event/work intervals into one exclusion-constrained reservation table. Source-owned projection and truncate guards remain. `guard_chef_work_block` rejects changes/releases to any linked block; `guard_chef_work_link` permits inserts only and locks block before occurrence. `lockOccurrenceWork` takes settings then block locks before approval storage locks the subject. Cross-domain conflicts, concurrent links/releases, failed replacement preservation and direct-write bypasses run against PostgreSQL. |
| Activation and consumers | `feature-controls.ts` freezes **administration, customerAccess, scheduling, approvalExecution, paymentCollection, autopay and outboxDispatch to false**; `requireMealPrepFeature` throws. Existing unit coverage attempts environment activation and verifies it still throws. Search of API routes, jobs, subscribers and storefront found no `executeApprovalCommand` or `selection_follow_up` consumer. These internal service methods intentionally remain callable by tests/trusted internal code; the flags are not an authorization wrapper around those methods. No public adapter or dispatch job is introduced. |
| Dependency/runtime versions | `.nvmrc` pins Node 24.22.1; packageManager pins Yarn 4.5.0; Medusa framework/CLI/test-utils are 2.7.0 and MikroORM core/knex/PostgreSQL are 6.4.3. Root/workspace manifests and lockfile are unchanged from the exact parent; this follow-up changes neither dependencies nor application sources. |

Relevant unchanged source is in `apps/medusa/src/modules/meal-prep/{capture-storage,capture-contracts,feature-controls}.ts`,
`apps/medusa/src/modules/shared-scheduling/{service,occurrence-work}.ts`, the shared
scheduling migration, and `apps/medusa/medusa-config.ts`. Execution coverage is in
`meal-prep-capture.suite.ts`, `meal-prep-approvals.suite.ts`,
`shared-scheduling.spec.ts` and `contracts.unit.spec.ts`. The full source remains
authoritative; this matrix is an inspection record, not a substitute for an
independent reviewer obtaining those files.

### Evidence boundaries

The new harness records Jest JSON, refuses skipped suites, runs both workspace
typechecks/builds, and repeats the actual-runner fresh/upgrade/rollback/reapply
rehearsal with row-hash checks. GitHub artifacts identify the exact checked-out
head. Local verification and hosted-job results must be reported separately.
The isolated automated reviewer still cannot run commands or fetch omitted
sources; a higher automated score is not guaranteed. A complete independent
review should inspect the named sources and the verification job/artifacts.
Nothing is merged, deployed, enabled, paid or notified by this follow-up.

Local rerun of this harness on 2026-10-31 passed **330 tests, none skipped**,
both typechecks, Medusa backend/admin and storefront client/server builds, and
the migration rehearsal with unchanged fixture row hashes. Node 24.22.1 and
PostgreSQL 16 were used; this rerun reused the installed dependencies. Missing
explicit database configuration was also verified to fail before test execution.
YAML parsing, Bash/Node syntax checks and `git diff --check` passed. The first
attempt found an expired disposable database port; a new dedicated container was
created and the complete test harness rerun successfully. Hosted CI results are
not implied by these local results and are linked separately in the PR.
