# Meal Prep V1 PR 6 — Approved-price billing and manual payment links

Authority: [full Requirements Contract v1.1, artifact revision 4](requirements-v1.1-r4.md), supplied in full in the coding prompt and retained unchanged in the repository. The reconciled BTS-3 architecture is subordinate. Assigned objective: implement PR 6 approved-price billing and **manual** payment-link infrastructure on PR #20, with independent work complete and unresolved product execution disabled. ChatGPT publishes the completed handoff to Arbor; this session does not publish there.

## Verified stack and scope

- Repository: `git@github.com:PabloJVelez/private-chef-template.git`.
- T3 confirmed its binding to `/home/openclaw/.t3/worktrees/private-chef-template/feat-meal-prep-v1-manual-payment-links`, branch `feat/meal-prep-v1-manual-payment-links`.
- Exact parent: **`f53912525d0250f09d81b6cb4ddb445cbdf5ff3a`**, open [PR #20](https://github.com/PabloJVelez/private-chef-template/pull/20), branch `feat/meal-prep-v1-arrangements-approvals`. Initial HEAD and live remote/GitHub parent matched; ancestry passed with zero child commits; the worktree was clean before edits.
- PR base is the parent branch, not `main`. Final head SHA, PR URL and exact-head hosted CI links belong in the PR/delivery response to avoid self-referential hashes here.
- No merge, deployment, production data, real charge, live provider call or customer-facing activation. No dependency/lockfile change. The parent branch/worktree is unchanged.

Before editing, the session stated contract v1.1/r4, applicable R05–R06/R15–R20, D04/D05/D10/D11 collection gates, D06 adjustment gate, D01 timing gate, preservation of D08/D09, additive billing migration and the PostgreSQL/provider/regression/typecheck/build validation plan. PR #20's non-payable `exact_review` is explicitly not scanned or promoted automatically into payment eligibility.

## Implemented boundaries

### Exact approval and authorization

`approveTestBillingQuote` is an additional chef command referencing the current chef-approved occurrence menu, expected occurrence version and exact reviewed amount/currency. It stores an immutable price snapshot, separate component amounts/provenance, chef actor, test-only policy provenance and connected account. Components must sum exactly; no calculation from servings, quantities, packages, groceries or fulfillment is introduced. Unknown, unapproved, stale, mismatched and zero payable values are rejected. Zero is not inferred as a free-service policy; such cases need a separate approved workflow.

The quote, one occurrence obligation, audit, reference-only manual-payment outbox intent, pending notification and command receipt commit atomically. This is the immediate notification **enqueue** boundary. An email failure cannot roll back approval. There is no production customer-access URL or real email sender while D10 is unresolved.

Customer authorization is a separate `pay_exact_quote_once` command for the exact bill and quote. The trusted principal comes from internal code, not request JSON. Cross-chef/customer/household references and revoked household access fail before receipt replay or private reads. The authorization commits a durable payment attempt before provider I/O. A chef cannot authorize payment on a customer's behalf. The authorization is **not** autopay consent or permission to charge off-session.

All new financial service commands require `NODE_ENV=test`. All feature controls, including `manualPaymentLinks`, remain false; there are no new routes, subscribers, scheduled jobs, UI controls or production provider registrations. Production activation needs reviewed code and product decisions, not an environment toggle. Test provenance is explicitly named `test-only-unresolved-D04-D05-D10-D11`; it is not accepted product-policy provenance.

### Manual link and collection lifecycle

An authorized attempt starts `prepared`. Dispatch commits `unknown` before requesting one Stripe-hosted Checkout Session. Returned links become `open`; `processing`, `requires_action`, `failed`, `expired` and `succeeded` remain separate states. Link creation, a Checkout completion notification with unpaid status, and browser redirects never imply payment success.

There is one durable attempt per obligation in this layer. Transport retries use its same connected account and provider idempotency key. Once a session ID is known, workers retrieve it instead of creating another. Ambiguous creates older than 23 hours from the persisted attempt are refused, conservatively within Stripe's finite idempotency retention. This is a technical duplicate-prevention bound, **not** a billing clock, payment deadline, reminder trigger, service restriction or cancellation rule. Session expiration is stored from Stripe and expired URLs are not returned. There is no automatic new attempt after a decline or expiry; replacement/retry policy remains a gate.

Webhook verification uses the Stripe SDK against original request bytes, the configured signing secret and timestamp tolerance. Test-mode and Connect account checks precede lookup. Events are deduplicated by connected account/event ID with a payload hash; changed payload reuse conflicts. Only reference metadata is stored. Every accepted event retrieves current Checkout/PaymentIntent state, checking session/intent identity, account scope, quote/obligation/attempt metadata, amount, currency and test mode. A collection requires a completed paid Checkout and a succeeded PaymentIntent with the exact received amount. Collection records are append-only and unique by obligation and account/intent. Late failures cannot reverse success. No raw card data, intake, home-access instructions or raw webhook payload is stored in payment records or provider metadata.

The occurrence orchestration lock is shared with menu approval. Billed menu replacements are blocked by both the command boundary and a database trigger, including same-price replacements, until the financial-change workflow is specified. Pending requests/rejections still work. Collection failure/authentication/expiry changes only payment/follow-up state; it never cancels, reschedules, releases work, changes fulfillment or blocks unpaid service. Reconciliation remains possible after household access is revoked; new dispatch and private customer reads do not.

### Medusa and notification adapters

`MedusaTestBillingAdapter` uses installed Medusa **2.7.0** order/payment collection interfaces, with explicit USD minor-to-major conversion (`1000 → "10.00"`) and dedicated occurrence/quote metadata. Its test order has one aggregate approved-amount line; quantity one is an accounting fixture, not a price-unit/servings decision. It uses no event tickets, `EVENT-` SKUs, product/variant inventory or private-event fee classifier. Test fixture records contain no shipping/tax/fee formula; they do not decide production classification or fulfillment.

Durable resource claims precede module calls. Returned order/collection IDs are persisted once; completed steps replay. An ambiguous module call blocks re-creation and requires retrieval of an explicitly identified existing resource with matching quote metadata, currency and total. This prevents blindly duplicating resources after a partial completion. An actual-runner disposable PostgreSQL test creates and retrieves real Medusa orders and unpaid collections for USD 0.01, 10.00 and 10.50. It caught and verifies the required explicit `total` selection in Medusa order retrieval.

**Technical release gate:** the dedicated ledger records provider collection independently. Medusa collections remain `not_paid`; this PR does not fabricate native Medusa payment-session/capture records or wire native order-payment links around an externally created Checkout Session. A reviewed native payment-provider/reconciliation adapter and full checkout E2E are required before activation. The resource shape and durable recovery boundary are validated; end-to-end Medusa paid-order integration is not claimed.

The notification worker persists attempts/failure/sent state and uses a stable idempotency key. Its sink is a test interface requiring recipient-side deduplication; tests cover timeout after delivery and retry. Already-paid obligations suppress an undispatched request notification. The worker is not scheduled or connected to Resend. Production access-link construction, authenticated payment-link delivery and real email-provider idempotency are blocked by D10 and remain unimplemented. No T-24h reminder or autopay worker exists in PR 6.

## Requirement-to-test mapping

| Requirement | Coverage and limitation |
| --- | --- |
| R01/R20 → T01/T14 | Full contract retained; immutable false flags; test-only execution and live-key rejection. D01/D04/D05/D06/D08/D09/D10/D11 remain unresolved. No production policy is inferred from fixtures. |
| R05/R06/R11/R18 → T08 | `billing-provider.unit.spec.ts` explicit minor/major conversion and DTOs; `meal-prep-billing.suite.ts` exact current approved price, unknown/stale/unapproved rejection, component sum, immutable snapshots and atomic rollback. USD-only adapter; production pricing/taxes/fees unsupported. |
| R12/R15/R18 → T08/T09 | PostgreSQL same-price menu-change versus billing race, billed-menu freeze, separate customer authorization, concurrent duplicate authorization/dispatch, timeout recovery, success-before-local-bind and local collection rollback/reconciliation. One obligation/attempt; no subscription, saved card or off-session action. |
| R16 → T10 | Immediate outbox/notification creation in the chef billing-approval transaction, notification failure/dedup retry and paid-before-dispatch suppression. Actual email/link-access delivery blocked; reminder timing deferred to PR 7/D01. |
| R17/R18 → T09/T11 | Failure/authentication/expiry preserve approval/scheduling state and set follow-up. Provider amount/currency/account/identity mismatches, signed forged/stale/changed webhooks, concurrent and out-of-order replay, monotonic collection, revoked household and cross-owner checks. Autopay fallback itself belongs to PR 7. |
| R18 → T09/T13 | Durable Medusa resource claims, partial timeout requiring reconciliation, exact retrieved identity/amount validation; actual installed modules exercise unpaid order/collection shape. Full Medusa capture/session integration is gated. |
| R09/R10–R14/R19 → T05–T07/T11/T12 | Existing four-pattern recurrence, approval/capture, shared scheduling, Availability and private-event unit/integration suites rerun unchanged except the additive billed-menu policy check. No event checkout/provider implementation changed. No new UI; existing rendered component tests rerun. |
| R19/R20 → T13 | Fresh actual-runner migration, exact-parent upgrade with populated arrangement/approval/history/Availability fixtures, row-hash preservation, empty billing rollback/reapply, populated billing rollback refusal and inherited legacy-event migration tests. Not production-scale data. |

## Migration and recovery

One additive meal-prep migration: `Migration20261031000600`, after `20261030000100`, `20261030000400`, `20261030000500`. It creates quote, bill, attempt, immutable collection/event, notification and commerce-resource tables, plus exact-price and billed-menu guards. It performs no backfill or modification to private-event, shared reservation, recurrence or Availability tables. Generated CRUD is not exposed for these raw financial tables. Application authorization and provider authenticity are service/adapter responsibilities; a database owner remains privileged.

Empty billing rollback is allowed, with a lock preventing a concurrent quote insert during the check. Any quote/history refuses destructive downgrade, even if there has been no successful payment. Preserve financial history and use forward fixes for populated data. Disabling payment capabilities must preserve reconciliation records and shared scheduling protections. The migration harness skips migration scripts/link synchronization intentionally; this layer adds no native Medusa module link.

## Executed local verification

Clean immutable dependency install with **Node 24.22.1 / Yarn 4.5.0**; host Node 24.16.0 was not used for checks. Real **PostgreSQL 16**, disposable loopback-only container `meal-prep-pr6-test`, separate random schemas/databases; no production credentials.

- Full run: **393 tests passed, none skipped:** Medusa **22 suites / 246 tests**, storefront **2 suites / 15 tests**, PostgreSQL **5 suites / 128 tests**, legacy migration **1 suite / 4 tests**. Final review added one worker-restart regression: the affected foundation/capture/approval/billing suite then passed **91 tests**, bringing final unique coverage to **394** (129 across the five PostgreSQL suites). A worker restarted after collection now completes without another provider call. Backend typecheck and backend/admin build were repeated successfully after this change.
- Both workspace typechecks and Medusa backend/admin + storefront client/server builds passed.
- Actual Medusa migration runner: fresh install, exact `f539125…` parent migration, populated-parent upgrade, empty billing rollback/reapply. Existing parent row hashes were unchanged throughout. Populated billing downgrade refusal is covered by PostgreSQL tests.
- Actual installed Medusa order/unpaid-collection round trips passed for 1, 1000 and 1050 minor units. Stripe API transport is mocked; real SDK HMAC verification runs locally. No network Stripe sandbox or Google E2E is claimed.
- `git diff --check` passed. Reports are in ignored `artifacts/meal-prep-verification/`; the [repeatable harness](../../scripts/verify-meal-prep/README.md) rejects skipped suites and is also run by exact-head CI. Hosted results are reported separately with the PR head SHA and job URL.

Inherited/nonblocking warnings: Yarn peers, React `act`, experimental Jest VM/force-exit, stale Browserslist data and the existing Vite unlock override warning. No UI or browser flow changed; no new browser E2E is claimed. Full private-event checkout/payment E2E, actual provider/email delivery, production-scale migration and final-stack owner testing remain gates.

GitHub also reports push-triggered failures for the inherited, fully commented-out `.github/workflows/barrio.yaml` and `.github/workflows/pr-checks.yaml`, with zero jobs. Their contents match the exact parent byte-for-byte; neither ran deployment or verification. They are retained unchanged and are reported separately from the active `Meal prep verification` exact-head job. An OpenClaw queue success confirms triggering only, not a completed substantive review.

## ChatGPT → Arbor handoff and unresolved gates

Publish PR URL, exact base/head SHAs, this requirement mapping, local evidence and exact-head CI to the assigned billing objective in Arbor. Request product decisions in BTS-2 through ChatGPT; this agent does not send an Arbor message.

- **D04/D05:** supported pricing/grocery/payment terms and complete payable amount; no invented formulas or defaults.
- **D10/D11:** production customer/household access and authenticated link delivery, plus platform fee classification. Block real email/link access and live collection.
- **D06:** replacements of billed menus/prices, refunds/cancellation and post-payment adjustments. Existing requests/rejections remain available; no financial effects are applied.
- **D01:** billing clock/timezone, late approval handling and reminder/autopay trigger. No timing policy is introduced; PR 7 remains separate.
- **D08/D09:** unpaid-service policy and production recurrence boundaries/conflicts remain unchanged and unresolved.
- D02/D03/D07/D12 and all inherited stack gates remain as recorded in PR #20. No claim of complete V1 release readiness.
- **Technical gates:** native Medusa paid-order/payment-session integration, production notification/access adapter and real Stripe Connect sandbox E2E. The adapter's verified USD test range is not a multi-currency or live-commerce approval.

Carry PR #20's owner-reported **8/10 review with no demonstrated blockers** as review context, not release approval. Its automated reviewer lacks tool execution and may omit unchanged source; a queue-job success is not test execution or substantive review. This PR supplies executable exact-head CI separately. Prior gaps in production-scale rehearsal, real providers/email, browser/payment/full checkout E2E and final-stack owner manual testing remain open. No merge/deploy; review each stacked layer and restack/retest if its parent changes. The automated OpenClaw review is expected from PR open/synchronize only; no manual dispatch or bypass is authorized.
