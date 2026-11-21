# Meal Prep V1 PR 1: additive foundations

Authority: [full Requirements Contract v1.1, artifact revision 4](requirements-v1.1-r4.md), supplied in the implementation prompt before edits. The reconciled architecture is proposed guidance, not product approval. The user explicitly authorized this worktree-local PR 1 implementation, commit/push and review PR; merge, deploy and production changes are prohibited.

Assigned [BTS-3 objective](https://arborthreads.com/threads/thr_263c8f9a-75d7-40aa-92b2-f9b717546180/define-meal-prep-technical-architecture-and-contracts): Reconcile the Meal Prep architecture and contracts with all canonical V1 requirements, including all four recurrence patterns and the existing Availability administration. This PR implements the baseline, contract and additive foundations workstream under Meal Prep Services. Arbor publication is for ChatGPT after completion; this agent has not published to Arbor.

## Baseline and scope

On 2026-10-30, before edits, `git fetch origin main` verified origin `git@github.com:PabloJVelez/private-chef-template.git` and HEAD = origin/main = `9ab70faed0e2b50246262833c370d5d21dd33742`. The bound worktree was clean on `feat/meal-prep-v1-foundations`. Main includes Availability (`3cb89ad`) and its soft-deleted-booking migration fix (`be8561a`). No different worktree was created.

Changes are limited to the dedicated meal-prep module, its registration, additive tables, tests and documentation. There are no routes, jobs, subscribers, UI changes, provider calls, scheduling operations or payment resources. Feature controls are frozen false constants; environment variables cannot enable unfinished flows. Module registration makes migrations discoverable and does not enable product capabilities.

## Persistence boundaries

- `meal_prep_subject` is an internal aggregate identity envelope, discriminated as arrangement or occurrence. Each occurrence belongs to an arrangement in the same chef/customer scope. Its explicit generation key is unique for the chef and never recycled after soft deletion. This is NOT a recurrence engine or an event/ticket record.
- `meal_prep_revision` stores immutable private draft snapshots with aggregate-wide revision numbers and contract provenance. Arrangement revisions and occurrence menu/quote revisions cannot be interchanged. Bodies are JSON draft envelopes; domain-specific eligibility, recurrence, pricing and policy validation are intentionally deferred. A quote draft is not approved pricing and is not payable.
- `meal_prep_approval` is an immutable decision ledger tied by composite foreign key to one exact revision, subject and revision kind. A partial unique index permits one initial arrangement approval; later amendments use change revisions. An arrangement decision cannot approve an occurrence menu. There is no approval/application command in this PR: later commands MUST authorize the chef, lock/check the current version, validate policy/scheduling/offer dependencies and atomically persist approval plus confirmed references, audit and outbox. Inserting a ledger row alone cannot confirm a booking or authorize money movement.
- `meal_prep_change_request` references an exact change revision and records the base version and request type. It has no application side effect. No confirmed schedule/menu/price pointers exist yet, so staged drafts and requests cannot overwrite confirmed details. Later application state will be added with the workflows that validate it.
- `meal_prep_audit` and `meal_prep_command` are append-only, including protection against generated CRUD updates, deletes and soft deletes. Idempotency keys are scoped to subject, authenticated actor and operation; a payload mismatch conflicts. Keys are not expired by a technical TTL.
- `meal_prep_outbox` durably records reference-only events with a unique deduplication key, delivery timestamp and attempt count. Event identity is immutable. There is no dispatcher, lease, delivery retry policy or exactly-once external-delivery claim in PR 1. Future consumers must deduplicate external effects and add recovery/claim primitives before activation.

`stageRevision` is the sole custom internal command. It validates input, locks and authorizes the subject, checks the receipt before stale-version checks (so successful retries work), increments the version, and writes revision/audit/outbox/receipt in one Medusa transaction. Failures roll everything back. Canonical JSON hashing makes object-key ordering irrelevant; array order remains significant. Authorization runs before receipt lookup. Audit and outbox carry references only, never draft/intake bodies.

The supplied principal is a trusted identity-resolver result, not client request input. Persistence-generated CRUD is NOT an authorization boundary or an approved command API. Nothing exposes it publicly. Future routes must use explicit commands and ownership checks; D10 still blocks customer access. Database owners remain trusted. Never store raw card data in any draft body; no billing/consent/card fields or integration are provided.

## Migration and rollback

`Migration20261030000100` creates seven meal-prep tables, indexes, composite foreign keys, and functions/triggers scoped to those tables. It does not backfill or alter any event, Availability, commerce, customer or provider table. Non-null ownership fields have no guessed defaults. Defaults are technical only: timestamps, aggregate version zero, outbox attempts zero. No recurrence bounds, payment deadlines, fees, limits or product statuses are defaulted.

Use the normal Medusa migration runner after review. Do not run repository production/prepare/reset scripts to test this change. Disposable tests execute the migration SQL transactionally and also exercise the Medusa service with a real transaction manager. The downgrade permits an empty installation only; once a subject exists it fails before dropping anything, requiring a forward fix to preserve history. Disabling features does not delete data. This PR does not implement shared reservations; that is PR 2, a prerequisite to meal-prep scheduling.

## Decision register (all unresolved)

- D01: Payment clock, timezone/anchor, DST, late approvals/bookings and hard due time. Blocks triggers/reminders/autopay timing.
- D02: Radius/ZIP combination, validation and out-of-area behavior. Blocks delivery eligibility.
- D03: Method windows, pickup location, closures, notice rules and non-delivery fees. Blocks method scheduling/fees.
- D04: Dish/serving semantics, packages and tailored pricing. Blocks production pricing.
- D05: Grocery approaches, deposits/true-ups and payment terms. Blocks affected quotes/charges.
- D06: Cancellation/refunds, paid price changes and financial effects of skips/reschedules. Blocks applying those transitions.
- D07: Pause effects on generated occurrences. Blocks application; recording requests is independent.
- D08: Unpaid service behavior. No automatic cancellation or fulfillment block is approved.
- D09: Recurrence horizon/end/replenishment and partial conflicts. Blocks materialization; no bounds default exists.
- D10: Customer identity and household/link access. Blocks public customer APIs.
- D11: Platform fee classification. Blocks live payment collection.
- D12: External-calendar assurance. Blocks changes to existing advisory Google behavior.

No decision above blocks this isolated storage foundation. No decision was made or published here. Delivery/pickup count caps and spending caps are excluded, not pending decisions. All three methods, all four selection styles and all four recurrence patterns remain full V1 requirements; their types are not claims of working product flows.

## Requirements and validation mapping

- **R01/R20 → T01:** Full exact contract and assigned objective in the workspace; locked feature controls and unresolved decision register. Unit tests verify all controls reject activation. Review verifies absence of policy defaults and runtime entry points.
- **R11 → T05 foundation / T13:** Distinct arrangement/occurrence scope and exact revision-kind approval references; PostgreSQL tests reject forged cross-subject/kind references. Approval execution and arrangement/menu approval workflows remain future work.
- **R12 → T05 foundation / T13:** Immutable revisions and requests, stale-version conflicts, serialized mutations, unchanged prior decision while staging a new change. Tests verify atomic rollback of version/revision/audit/outbox/receipt and duplicate command behavior.
- **R19 → T07/T12 regression / T13:** Additive migration and only one existing-code registration change; existing unit suites and Availability PostgreSQL suites. No new event commerce behavior. Full checkout/provider E2E is not claimed.
- **R18 foundation → T11:** Trusted-principal interface, chef/customer ownership checks before receipt lookup, reference-only audit/outbox. Tests verify cross-chef/customer access rejection and no private draft contents in those records. No public identity resolver, full authorization surface or payment safety implementation yet.
- **R02/R03/R10 → type preparation only:** Three methods, four selection styles and four recurrence intent variants, with no production activation or recurrence generator. Serving capture does not choose billing semantics. Full T02/T03/T05 awaits later PRs.

Test execution evidence and environment limitations are recorded in the final PR handoff. No rendered UI change requires new browser coverage; existing rendered component tests remain regression coverage. This PR makes no claim to complete T01–T14 or launch V1.

## Execution evidence — 2026-10-30

Validated using Yarn 4.5.0 and Node **24.22.1** (installed in a temporary tool directory because the host default is 24.16.0). Dependency installation used the existing lockfile with `--immutable`; no dependency/lockfile changes. PostgreSQL **16** ran in a disposable local Docker container bound to loopback with no production credentials or volumes.

- `yarn workspace medusa test:unit`: **17 suites / 169 tests passed**, including three new foundation unit tests and existing rendered admin/Availability component tests.
- `yarn workspace storefront test:unit`: **2 suites / 15 tests passed**, including Availability request-flow component coverage.
- With `MEAL_PREP_TEST_DATABASE_URL` and `AVAILABILITY_TEST_DATABASE_URL` pointing only to the disposable server, `yarn workspace medusa test:integration:http --runTestsByPath integration-tests/http/meal-prep-foundations.spec.ts integration-tests/http/availability-concurrency.spec.ts integration-tests/http/availability-save.spec.ts`: **3 suites / 20 tests passed, none skipped**. This includes 13 new foundation cases and 7 existing Availability cases. The new tests load the real Medusa module and its transaction decorators against the migration-created schema.
- `yarn typecheck`: **Medusa and storefront passed**.
- `yarn build`: **Medusa backend/admin and storefront client/server passed**.
- `git diff --check`: passed.

Migration tests cover empty install/down/up; additive upgrade fixtures with confirmed, completed and soft-deleted legacy bookings; scoped foreign keys; immutable history and identities; real module CRUD reads; forced failure of the final transaction write; concurrent stale and duplicate commands; and populated downgrade refusal. They execute migration SQL in transactions; a full production-sized application migration rehearsal remains later work. Cross-domain occupied-time races are PR 2 and are not claimed here.

Non-failing existing tooling warnings: Yarn peer-dependency mismatches, storefront React `act(...)` warnings, Node's experimental VM-modules notice, Jest's repository-configured forced-exit notice, and Turbo's Medusa build-output configuration warning. No Stripe/Google calls or end-to-end live checkout tests were performed. No new UI was introduced, so no separate browser session was needed.

## Review and next work

Review the manual migration constraints/triggers together with the DML models; future generated migrations must preserve those invariants. The aggregate/revision envelopes are a deliberate PR 1 foundation, not the entire logical record design. Approval execution, confirmed-reference updates, application states, typed domain validation, billing records, worker claiming/reconciliation, reservation projection and public authorization are deferred to their assigned PRs. This is a scope staging decision, not a product-policy deviation.

Next independent work is PR 2 shared actual-time protection, including synchronous private-event projection and cross-domain race coverage. D01–D12 remain for authorized product decisions; this PR introduces no new blocking product question and does not publish to Arbor. Merge and deployment require separate human review/authorization.
