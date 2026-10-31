# Meal Prep V1 PR 7 — Opt-in autopay and explicit-trigger reminders

Authority: the complete [Requirements Contract v1.1, artifact revision 4](requirements-v1.1-r4.md). The reconciled BTS-3 architecture and stacked delivery plan were recovered in full from the prior T3 handoff. PR #25's implementation and latest complete-source review were read before implementation. The user confirmed that the PR 7 brief is the complete assigned BTS-7 implementation objective. Architecture proposals do not resolve product policies.

## Stack and authorization

- Repository: `git@github.com:PabloJVelez/private-chef-template.git`.
- Exact parent: `7d11dc33b9392f3b8082ab23b70e7c93b15a56dc`, open/unmerged [PR #25](https://github.com/PabloJVelez/private-chef-template/pull/25), branch `feat/meal-prep-v1-manual-payment-links`.
- Created the isolated worktree `/home/openclaw/.t3/worktrees/private-chef-template/feat-meal-prep-v1-autopay-reminders`, branch `feat/meal-prep-v1-autopay-reminders`, directly at the requested parent. HEAD and merge-base were verified before edits. All development commands target this worktree explicitly; the original T3 conversation remains associated with its original checkout because T3 cannot rebind an already-attached worktree.
- Parent branch and worktree remain unchanged. All preceding stack commits are retained. No merge, deploy, real customer charge/email, production migration or feature activation is authorized or performed.
- PR URL, final base/head SHAs and exact-head hosted CI links are supplied in the PR and final handoff to avoid self-referential hashes here.

Before editing, the session stated applicable R15–R18, inherited approval/compatibility requirements, D01 and other payment/access gates, affected module/migration/verification paths, and PostgreSQL/provider/typecheck/build test coverage.

## Consent and saved methods

Hosted method setup, customer opt-in and chef scheduling are separate commands. Saving a method does not authorize a charge. Consent is explicit, customer-only, immutable and limited to one occurrence bill, exact approved quote, amount, currency, connected account and verified saved method. It records the actor, approval version, authorization and consent-text version. The test text identifier `test-occurrence-consent-v1` is fixture provenance, not approved production consent copy.

Opt-out and method invalidation append immutable records. Authorization runs before receipt replay. Cross-customer, cross-household, wrong-role, stale-version, wrong-quote and wrong-amount commands fail. Current household ownership and confirmed menu are checked again before dispatch. Pending menu requests do not replace the frozen billed menu.

If revocation wins the occurrence lock before the first durable dispatch marker, no provider operation is allowed and the undispatched attempt is closed, leaving manual authorization available. If dispatch has already committed, the payment is in flight: revocation blocks further creates but reconciliation remains allowed. Opt-out does not invent a refund. An ambiguous create with no bound intent remains blocked after revocation until an authenticated provider event or verified reconciliation establishes its outcome.

The provider-independent interfaces store references only. The isolated Stripe Connect adapter creates an account-scoped Customer and Checkout **setup** session with stable keys. It verifies session, customer, SetupIntent, off-session usage, account scope, ownership metadata and the attached card method before accepting a ready method. Charges recheck method attachment. Raw card details and client secrets are never persisted. No subscription or spending cap exists.

One saved setup, consent and autopay attempt per bill are deliberately conservative technical boundaries. Re-enrollment or replacement attempts after revocation/decline require a separately reviewed command and must not recycle old consent or provider keys. This is not a customer retry/cancellation policy.

## Payment execution and recovery

Autopay and PR6 manual payment use the same occurrence orchestration lock, obligation and immutable collection ledger. Database insertion guards reject concurrent competing paths. The collection ledger adds an optional autopay source and enforces exactly one source and one collection per bill. Existing manual rows and provider behavior are preserved.

The worker commits its attempt and dispatch marker before provider I/O. Stripe receives the exact approved minor-unit amount, account-scoped stable key, saved customer/method, reference metadata and explicit off-session confirmation. No fee/tax/grocery formula, event SKU or native Medusa subscription is used.

Retries with an unknown intent retain the same identity and key. Unknown creates older than 23 hours from first dispatch are refused because provider key retention is finite. This technical bound is not a billing deadline or T-24h policy. Once an intent is bound, workers retrieve it and never create or reconfirm another charge. An already-collected worker restart is a no-op. Setup creates have their own conservative retention bound.

The webhook handler authenticates original bytes before private reads, scopes the event to its connected account, and retrieves canonical provider state. Amount, currency, quote, consent, attempt, customer, method and metadata must match before collection. Replay keys are account/event scoped with payload hashes; conflicting payload reuse is rejected. Success is monotonic; late failures cannot erase it. Local collection-write failure rolls back event application and can be reconciled without another charge.

Declines and authentication requirements persist a manual-fallback outbox intent and chef follow-up. Scheduling, confirmed menus, reservations and fulfillment are untouched. A fallback worker verifies cancellation of the **payment intent**, not the occurrence, before permitting the manual collection path. If cancellation times out or payment races to success, it reconciles instead of exposing a second collectible obligation.

Fallback preserves PR6's explicit customer authorization before hosted manual Checkout creation. The exact approved quote is reused. Integration tests run the full failure → provider cancellation → customer manual authorization → hosted-link path. The durable fallback intent is prepared immediately; real authenticated link delivery is still blocked by D10. There is no invented public-access mechanism, automatic replacement charge or automatic cancellation of service.

### PR #27 detached-method review correction

A verified detached/reassigned/invalid saved method now raises a typed
`AutopayPreCreateRejection` before the Stripe adapter calls PaymentIntent creation.
The controller records cancellation and the fallback outbox atomically under the
existing occurrence lock **only when the attempt is unknown, has no intent, and
has exactly one durable dispatch**. A later dispatch then sees a terminal attempt
and cannot create a charge. The original consent and dispatch history remain intact;
manual Checkout still requires the customer's exact-quote authorization.

A rejection proves only that invocation did not create. If another invocation was
previously or concurrently dispatched, its charge may exist, so manual collection
remains blocked pending canonical reconciliation. Lookup timeouts, untyped error
messages, bound intents and prior successful collection never use this shortcut.
This deliberately does not infer no-charge from multiple failed worker calls.
A canceled no-intent attempt requires no provider cancellation.

Regression coverage uses real PostgreSQL and the Stripe adapter with SDK transport
mocked for detached method → dispatch → notification → exact manual Checkout.
Additional tests cover an earlier timeout after success, concurrent rejection before
and after success persistence, untyped errors, and transactional outbox failure.
No real Stripe call, charge, email, activation, or migration change is introduced.

Correction validation on Node 24.22.1 / PostgreSQL 16: **469 unique tests passed,
none skipped** (280 Medusa, 15 storefront, 170 PostgreSQL, 4 legacy). Both workspace
typechecks and backend/admin/storefront builds passed. Fresh install, populated
parent upgrade, empty PR7 rollback/reapply and installed Medusa adapter rehearsal
passed with unchanged parent financial hashes. Hosted exact-head results remain
separate from these local checks.

## Explicit triggers and notification outbox

Scheduling accepts an explicit timestamp with offset, policy reference, approval reference and the fixture marker `test-only-unresolved-D01`. Only the chef can record it. No worker derives the timestamp from service start, local midnight, a timezone, DST or an elapsed-hours rule. Missing provenance and non-future approval timestamps fail closed; no late-approval catch-up policy is selected. Existing approved jobs can retry after interruption using their original timestamp and identity.

Unpaid-reminder and fallback intents have stable bill/kind deduplication keys, reference-only outbox entries, append-only dispatch/results, and recoverable 60-second worker leases. The lease is a technical claim, not a customer deadline. Concurrent workers cannot acquire an active claim, stale tokens cannot authorize delivery, and terminal notification states cannot be reversed.

Dispatch checks for collection under the occurrence lock both when claiming and immediately before authorizing the external send. A payment committed before final dispatch authorization suppresses the message. Once an external delivery is authorized/accepted, a later payment cannot retract it: PostgreSQL and an email service do not share a transaction. A production sink must durably deduplicate the stable key, including timeout after acceptance. Tests model this receiver contract; no exactly-once email delivery from a non-idempotent provider is claimed. No production sink, Resend call or scheduled job is registered.

## Requirement-to-test mapping

| Requirement | Executed coverage / boundary |
| --- | --- |
| R01/R20, T01/T14 | Full contract retained, strict explicit-trigger contracts, unresolved/past/missing timing rejection, production runtime/live-key rejection, frozen false flags. No product-approved timing calculation is claimed. |
| R11/R12/R15/R18, T08/T09/T11 | PostgreSQL exact consent, setup-not-consent, wrong role/owner/household/quote/amount/version, immutable history, opt-out/method invalidation, revocation before and after dispatch, shared manual/autopay exclusion. Inherited approval/menu/unknown-price cases rerun. |
| R15/R18, T09 | Concurrent creates use one stable provider identity; timeout after success, finite key retention, success before/after local binding, rollback of collection writes, worker restart, signed replay/conflicting payload, out-of-order failure, wrong account/amount/currency/consent/customer/method and forged signature tests. |
| R17, T09/T10 | Decline and authentication-required outcomes keep the full approval/schedule state, prepare fallback/follow-up, block manual collection while ambiguous, verify intent cancellation and exact-amount hosted manual fallback, suppress fallback if success races cancellation. |
| R16, T10 | Supplied future trigger with provenance, no timing defaults, premature dispatch rejection, paid-between-claim-and-send suppression, delivery timeout deduplication, concurrent claims, abandoned leases and stale result handling. |
| R18, T11 | Stripe SDK transport mocks verify hosted setup, Customer/SetupIntent/method association, live-mode and wrong-owner rejection; real SDK HMAC verifies raw webhook bytes. No raw card storage. |
| R19, T07/T12 | Full inherited Availability/shared-time/approval/billing suites plus dedicated existing private-event provider tests for amount conversion, connected account, fees, manual capture, authorization and capture replay. Existing event implementation is unchanged. No browser/full private-event checkout E2E is claimed. |
| R19/R20, T13 | Real PostgreSQL 16 fresh install, exact-parent upgrade with populated manual financial history, before/after hashes, empty PR7 rollback/reapply, populated PR7 rollback refusal, actual installed Medusa order/unpaid-collection adapter tests and inherited legacy migrations. |

Key files: `autopay-contracts.ts`, `autopay-storage.ts`, `autopay-worker.ts`, `stripe-test-autopay-provider.ts`, service wrappers and `Migration20261031000700.ts` under `apps/medusa/src/modules/meal-prep/`; `meal-prep-autopay.suite.ts`; provider/private-event unit tests; and the [verification harness](../../scripts/verify-meal-prep/README.md).

## Migration and rollback

`Migration20261031000700` follows PR6's `20261031000600`. It adds setup/invalidation, consent/revocation, trigger, autopay attempt/event, notification intent/dispatch/result tables and guards. It adds a nullable autopay source to the existing collection table and extends its matching guard without rewriting existing rows. There are no private-event, Availability or shared-reservation schema changes.

Rollback locks setup and trigger tables, refuses any PR7 history, and otherwise removes only PR7 additions and restores the prior collection guard/non-null manual source. PR6 financial history can remain populated. The actual Medusa runner rehearses fresh installation and upgrade from the pinned PR6 commit, verifies all prior financial fields by hash, rolls back empty PR7 and reapplies. Populated PR7 history requires forward fixes; disabling capabilities must preserve it.

## Execution evidence and release gates

Required toolchain: Node **24.22.1**, checked-in Yarn **4.5.0**, immutable lockfile install, disposable loopback PostgreSQL **16**, dummy provider credentials. All providers use mocked transport; Stripe webhook HMAC is real SDK verification. Local reports reside in ignored `artifacts/meal-prep-verification/`; hosted CI uploads the same evidence with the exact head SHA. Final counts, run URLs and artifact inspection belong in the PR handoff.

Local verification completed: **461 unique tests passed, none skipped** (278 Medusa unit/rendered, 15 storefront, 164 PostgreSQL integration, 4 legacy migration tests). The final opt-out/manual recovery correction was verified by rerunning the complete **126-test occurrence suite**, with no skips, and both typechecks/builds again. The final migration, fresh/upgrade/rollback/reapply and installed Medusa adapter rehearsal passed; populated PR6 row hashes match. `git diff --check` passed. The inherited fully commented `barrio.yaml` and `pr-checks.yaml` workflows are byte-identical to the parent; zero-job failures from those files are separate from active application verification.

All feature flags remain false, including `autopay`, `timedReminders`, `savedPaymentMethods`, `manualPaymentLinks`, `paymentCollection`, `customerAccess` and `outboxDispatch`. All new commands, workers and provider operations require test runtime. No public route, UI, cron, subscriber or production provider registration was added. Activation requires reviewed code and approved policies, not an environment toggle.

Outstanding product decisions: D01 timing/timezone/DST/late approvals/hard due time; D04/D05 pricing/groceries/payment terms; D10 customer access and authenticated link delivery; D11 platform fee classification; D06 cancellation/refunds/paid-price changes; D08 unpaid fulfillment. All other inherited D01–D12 gates remain unchanged. No spending-cap, recurring-subscription, cancellation, refund or unpaid-service policy has been introduced.

Inherited technical gates remain: native Medusa paid-order/payment-session/capture reconciliation (the dedicated ledger is authoritative only for this test foundation; Medusa collections remain unpaid), real Stripe Connect sandbox E2E, production email/access and durable email-provider deduplication, full checkout/browser E2E, production-scale migration and final-stack owner manual testing. Parent #25's latest complete-source/artifact review reports **9/10 confidence for its test-only scope**; it is not release clearance.

## ChatGPT → Arbor BTS-7 handoff

ChatGPT should publish the PR URL, exact base/head commits, requirement mapping, migration and test evidence, CI links and automatic review disposition to BTS-7. This agent does not publish to Arbor. Direct Arbor access redirected to login and T3 browser setup was blocked by the host sandbox; BTS-7's live thread and any later Arbor changes could not be inspected. The owner explicitly confirmed the implementation brief is complete and authorized proceeding from the recovered canonical contract, reconciled architecture, delivery plan and parent handoff. This access limitation does not alter the contract.

Request the outstanding product decisions in BTS-2 before activating dependent behavior. Preserve all technical gates and final-stack manual testing. Let the existing automatic OpenClaw `pr-review` run on PR open/synchronize; do not manually dispatch it. No merge or deployment.
