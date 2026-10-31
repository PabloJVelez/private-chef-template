# BTS-3 — Meal Prep V1 reconciled technical architecture

**Status: proposed pending review**  
**Product authority:** Meal Prep V1 Requirements Contract **v1.1, artifact revision 4**, dated 2026-10-29.  
**Supersedes:** BTS-3 architecture draft, artifact revision 2, wherever this proposal corrects that draft.  
**Implementation authorization:** None granted by this document. Unresolved customer-facing policies require explicit product decisions.

**Assigned objective:** Reconcile the Meal Prep architecture and contracts with all canonical V1 requirements, including all four recurrence patterns and the existing Availability administration.

**Publication status:** Transferred from the completed T3 session into Arbor by ChatGPT. The original T3 agent could not authenticate to Arbor.

[Destination BTS-3 thread](https://arborthreads.com/threads/thr_263c8f9a-75d7-40aa-92b2-f9b717546180/define-meal-prep-technical-architecture-and-contracts) · [BTS-2 product decisions](https://arborthreads.com/threads/thr_d3aaf82d-68a9-4a5f-b231-4aec14bc840a/define-the-first-meal-prep-service-experience)

## 1. Authority, repository verification, and corrected findings

### Authority

The supplied full text of contract v1.1, artifact revision 4, governs this proposal. The supplied prior architecture is subordinate.

New product decisions must be explicitly recorded in BTS-2 and incorporated into a version-bumped contract. Neither implementation convenience, existing private-event behavior, nor this proposal resolves an open meal-prep policy.

Requirement identifiers below are traceability labels introduced by this proposal; they do not change the contract.

### Verified repository

Read-only inspection established:

- **Workspace:** `/home/openclaw/projects/private-chef-template`
- **Origin:** `git@github.com:PabloJVelez/private-chef-template.git`
- **Checked-out branch:** `fix-magic-link-mobile-admin`
- **Checked-out commit:** `2d69eb3469bb80550723ad980651c93416d4137d`
- **Working tree:** Clean at the beginning and end of inspection.
- **Locally cached `origin/main`:** `9ab70faed0e2b50246262833c370d5d21dd33742`
- **Availability feature ref inspected:** `feat/live-chef-availability`, commit `02740eeebd95d66308195e7432650b0bebef626b`
- **Availability deployment-fix ref inspected:** `fix/availability-deploy-types`, commit `be8561aa944f5d5eba7a31487b21fecc18613ba1`

The checked-out commit predates the existing Availability implementation. That implementation exists on the inspected feature/fix refs and locally cached `origin/main`. Relevant Availability, chef-event, Stripe, and Google Calendar code on the deployment-fix ref matches cached `origin/main`.

No checkout, fetch, code edit, commit, push, PR, migration, or publication was performed. No test suite was executed; findings are from source inspection. Cached refs do not establish the current remote or deployed revision.

**Implementation baseline:** Start from freshly verified main containing the existing Availability implementation and the soft-deleted-booking migration fix. Do not build from the older checked-out commit and accidentally recreate or omit Availability.

### Verified technical findings

1. **Existing event booking is a different domain.** `ChefEvent` uses party size, event menus, event-ticket products and ticket inventory. An existing `meal-prep` experience label does not implement the required recurring meal-prep service.

2. **Existing menus lack the required dated serving-based offer model.** Dish records provide menu content, but do not supply occurrence-level serving selections, dated eligibility or immutable price approvals.

3. **Availability already exists.** The canonical admin destination is `/app/settings/availability`, implemented at `apps/medusa/src/admin/routes/settings/availability/page.tsx`. It owns timezone, working hours, date exceptions, advance-notice rules and Google Calendar controls. Extend this screen.

4. **Private-event concurrency protection already exists on the newer baseline.** PostgreSQL exclusion constraints protect accepted bookings and in-progress acceptance claims. Tests exercise overlapping acceptance and direct-write protection.

5. **Google rescheduling findings depend on the baseline.** The old checkout directly updates event times during incremental sync. The Availability baseline adds database guards preventing accepted-event reschedules, including inbound Google writes. Meal prep must preserve that private-event protection while adding its own approved-reschedule mechanism.

6. **Google availability is currently advisory on failure.** Despite the stored mode name `required`, inspected code logs failures and falls back to internal bookings. Historical prose describing unconditional fail-closed behavior is not an accurate description of this baseline.

7. **The existing six-month horizon belongs to private-event slot lookup.** It does not authorize a meal-prep recurrence materialization horizon.

8. **Stripe Connect direct charges already exist.** The inspected provider creates PaymentIntents on connected accounts, but does not forward an idempotency key in the inspected creation call. Dedicated saved-method consent and scheduled occurrence charging are absent.

9. **Money and platform-fee boundaries need explicit handling.** Existing code mixes major-unit and minor-unit conventions and classifies event fees using an `EVENT-` SKU prefix. Meal prep must not inherit a fee category accidentally.

Source anchors on the inspected cached-main commit:

- [Availability UI](https://github.com/PabloJVelez/private-chef-template/blob/9ab70faed0e2b50246262833c370d5d21dd33742/apps/medusa/src/admin/routes/settings/availability/page.tsx)
- [Availability calculation and Google fallback](https://github.com/PabloJVelez/private-chef-template/blob/9ab70faed0e2b50246262833c370d5d21dd33742/apps/medusa/src/lib/availability/query.ts)
- [Existing booking constraint and migration](https://github.com/PabloJVelez/private-chef-template/blob/9ab70faed0e2b50246262833c370d5d21dd33742/apps/medusa/src/modules/chef-event/migrations/Migration20261015000300.ts)
- [Existing concurrency tests](https://github.com/PabloJVelez/private-chef-template/blob/9ab70faed0e2b50246262833c370d5d21dd33742/apps/medusa/integration-tests/http/availability-concurrency.spec.ts)
- [Stripe Connect provider](https://github.com/PabloJVelez/private-chef-template/blob/9ab70faed0e2b50246262833c370d5d21dd33742/apps/medusa/src/modules/stripe-connect/service.ts)

### Corrections to the old architecture

- **Remove automatic delivery/pickup order and serving caps completely.** No quota fields, capacity counters, remaining-capacity calculation, count-based rejection, or count-based “sold out” state.
- **Remove per-occurrence spending caps completely.** This feature is excluded from V1, not awaiting approval. Remove the draft’s suggestion that prior T3 consent makes it binding.
- **Retain shared protection of actual chef occupied time.** Manual capacity assessment does not permit double-booking actual work.
- **Do not treat a pickup order as an exclusive chef appointment.**
- **Do not fix T-24h to service start, elapsed hours, midnight, or a timezone.**
- **Do not introduce a block-unpaid-fulfillment rule, automatic cancellation, refund default, grocery default, or hard payment deadline.**
- **Remove the proposed eight-week recurrence default.** Do not replace it with the private-event six-month horizon.
- **Do not require a specific customer login mechanism yet.** Customer authorization is mandatory; its customer-facing mechanism remains open.
- **Correct the claim that concurrency tests are absent.** Existing private-event tests must be extended to cover meal prep and cross-domain races.
- **Preserve all four recurrence patterns and all three fulfillment methods in V1.** An incremental PR sequence does not reduce launch scope.

## 2. Requirement-to-design mapping

Each requirement maps to the architecture below and the acceptance tests in section 6.

- **R01 — Authority and implementation gate.** Versioned contract provenance, explicit decision dependencies, review-gated PRs and full-text coding handoffs. No policy is inferred from the old draft. **Tests/review: T01.**

- **R02 — Three independently enabled fulfillment methods.** Chef service configuration has independent in-home, delivery and pickup enablement. Occurrences snapshot the approved method and associated location/window. **T02.**

- **R03 — Four supported selection styles.** Configuration enables individual dishes/quantities, packages, chosen-menu visits and tailored-plan requests. All converge on an occurrence-specific menu and price approval; unresolved pricing mechanics remain gated. **T03.**

- **R04 — Relevant-date dishes and servings.** Dated offer revisions determine eligible dishes. Every selected dish records servings independently of the eventual billing-unit interpretation. Eligibility is checked during selection and approval. **T03, T05.**

- **R05 — Cooking prices and fulfillment fees.** Shared dish/base-price definitions apply across methods. Approved quotes separately identify cooking charges and any approved fulfillment charges. Per-dish/per-serving semantics remain unresolved. **T03, T08.**

- **R06 — Grocery approach and payment terms.** Configuration records chef choices only from product-approved supported configurations. No assumed grocery inclusion, reimbursement, deposit or true-up formula. **T08, T14.**

- **R07 — Delivery area.** Model radius-around-address and ZIP-list inputs; in-area delivery is free. Combination, validation and out-of-area behavior require decisions. No paid out-of-area path. **T02, T14.**

- **R08 — Manual delivery/pickup capacity.** Chef review may show orders and servings by date/window. These are summaries only and never control acceptance. **T04.**

- **R09 — Existing Availability and actual occupied time.** Extend existing Availability; retain private-event scheduling and global time off. Shared reservations protect actual work. Pickup windows do not automatically reserve full appointments. **T04, T06, T07.**

- **R10 — Four recurrence patterns.** Support weekly fixed day/time, every two weeks, multiple visits per week, and explicit custom agreed dates through one arrangement/occurrence engine. **T05.**

- **R11 — Separate arrangement and occurrence approval.** Chef approves the arrangement once; each occurrence’s initial menu receives its own approval. Arrangement approval never implies menu or price approval. **T05, T08.**

- **R12 — Approved changes only.** Menu/portion changes, reschedules, skips and pauses are requests with separately recorded chef decisions. Pending requests preserve confirmed details. **T05, T06, T08.**

- **R13 — Missed selections.** Deadline processing creates a resolution flag and chef/customer notification. It does not copy menus, substitute dishes, cancel, or charge an unknown amount. **T05, T10.**

- **R14 — Intake.** Capture allergies, dietary restrictions/preferences, household size/portions, equipment/storage/containers and relevant location/access information. In-home questions are conditional. **T02, T11.**

- **R15 — Per-occurrence payments and optional autopay.** Each occurrence has its own bill and payment state. Opted-in autopay charges the exact approved payable amount at the eventually approved T-24h trigger. No subscription or spending cap. **T08, T09.**

- **R16 — Manual payment emails.** Without autopay, enqueue the payment-link email immediately after menu-and-price approval. If still unpaid at the approved T-24h trigger, email a reminder. This trigger is not a cancellation deadline. **T09, T10.**

- **R17 — Autopay failure/authentication.** Keep the booking scheduled, email a payment link and flag chef follow-up. **T09, T10.**

- **R18 — Financial and card safety.** No charge without exact approved pricing and applicable consent. Stripe-hosted card collection, account-scoped payment references, durable attempts, provider idempotency and webhook reconciliation. **T08, T09, T11.**

- **R19 — Private-event compatibility.** Dedicated meal-prep orders and domain records; no ticket-product, guest-count or event-capture reuse. Shared scheduling/provider changes require explicit migrations and regression tests. **T07, T12.**

- **R20 — Unresolved policies remain unresolved.** Decision register blocks dependent implementation and activation. Missing policy is never converted into a default. **T01, T14.**

## 3. Proposed architecture and interfaces

### 3.1 Domain boundaries and records

Add a dedicated Medusa meal-prep module, a shared scheduling component, and a meal-prep billing orchestration layer. Retain existing private-event and menu modules.

Use the following logical records:

- **Service configuration:** Chef/store scope, independently enabled methods and selection styles, references to approved delivery/pricing/payment policy versions.
- **Dated offer revision:** Relevant date/week, offered dishes, shared base-price references and immutable published content.
- **Household/intake:** Customer ownership and revisioned dietary, portion, equipment, storage and relevant access information.
- **Arrangement and arrangement revision:** Recurrence definition, fulfillment preferences, participants and chef approval.
- **Occurrence:** Stable recurrence identity, arrangement reference, confirmed schedule/menu references, independent payment and fulfillment status.
- **Menu revision and dish lines:** Immutable dish descriptions, offer provenance, requested quantities and servings, and pricing inputs.
- **Quote revision:** Currency, cooking lines, approved separate components, exact payable total and pricing-policy provenance.
- **Approval:** Chef identity, timestamp and exact arrangement/menu/quote/change revision approved.
- **Change request:** Type, requested patch, base version, submitter, chef decision and application status.
- **Occupied work block and occurrence links:** Actual work interval, chef resource, purpose and linked occurrences.
- **Billing obligation and payment attempts:** Approved quote, Medusa order/payment collection links, Stripe account/intent references and attempt state.
- **Autopay consent:** Customer, scope, connected account, saved-method reference, consent text/version and revocation.
- **Audit, outbox and reconciliation records:** Durable history, notifications, job execution and external-side-effect recovery.

Enforce unique occurrence generation keys, revision numbers, source reservation identities and idempotency keys.

Do not add a capacity-limit, remaining-servings, remaining-orders or spending-cap property.

Reuse dish content by reference and snapshot where suitable. Do not attach meal-prep quantities to private-event ticket inventory or require a private-event experience ID to create a meal-prep occurrence.

### 3.2 Independent states and approval behavior

Keep these concerns separate:

- Arrangement approval and requested pauses.
- Occurrence schedule and approved exceptions.
- Menu/quote approval.
- Payment processing and collection.
- Fulfillment execution.
- Attention flags and unresolved requests.

A failed payment changes payment/attention state, not schedule state. A missed menu deadline changes attention state, not the booking or menu. A pause request does not pause an arrangement until approved.

Approval operations must:

1. Authenticate and authorize the actor.
2. Check the expected aggregate version.
3. Validate the exact referenced revisions and relevant policy dependencies.
4. Revalidate any affected schedule or dated offer.
5. Commit confirmed references, approval, audit and outbox entries atomically.
6. Dispatch external effects after commit.

Pending requests never overwrite the confirmed record. Rejection leaves it unchanged. Stale approvals return a conflict requiring reload.

Requested commercial changes may be recorded while policy is unresolved. Applying changes that depend on cancellation/refund, paid-price-adjustment or generated-occurrence pause rules remains blocked until the corresponding decision exists.

### 3.3 Recurrence engine

Support these definitions explicitly:

- **Weekly fixed:** Local weekday and time, schedule timezone, anchor date.
- **Every two weeks:** Same fields with a two-week interval anchored to the agreed starting week; never infer parity from ISO week numbers.
- **Multiple visits per week:** A set of independently identified weekly slots, each with its agreed day/time.
- **Custom agreed dates:** Explicit identified dates and agreed times/windows; no artificial weekly recurrence.

Keep local scheduling intent and resolved UTC instants. Scheduling timezone does not establish the payment-trigger timezone.

Use a stable generation key based on arrangement, recurrence revision and logical slot/date identity. A reschedule retains the existing occurrence identity and original generation key. Approved skips leave tombstones so regeneration cannot recreate them.

The materializer takes explicit bounds and is restart-safe. It must not contain an eight-week, six-month or other production horizon default. Horizon, arrangement end and partial-conflict treatment are decision dependencies.

Additional rules:

- Arrangement approval is recorded once for that agreed arrangement.
- Each generated occurrence begins without an approved menu.
- Editing a recurrence definition produces a requested arrangement revision; it does not rewrite confirmed occurrences.
- Generation does not copy a prior approved menu.
- Conflicting candidates carry explicit conflict information; the system must not silently omit them and present the series as fully scheduled.
- Ambiguous or nonexistent local times require an explicit agreed resolution; do not silently shift them.
- Pauses preserve already-generated occurrences until the product-approved pause treatment is applied.
- Occurrences beyond the materialized interval are not represented as reserved.

### 3.4 Existing Availability integration

Extend `/app/settings/availability` with meal-prep method schedules and a read-only explanation of which actual work blocks affect chef availability.

Preserve:

- Existing timezone and working-hours editor.
- Existing date exceptions/global time off.
- Existing private-event advance-notice semantics.
- Save/discard behavior, unsaved edits and stale-response protection.
- Google connection controls and navigation.
- Existing private-event request, acceptance and checkout flows.

Separate three scheduling concepts:

1. **Global chef working availability/time off.**
2. **Method-specific service dates or fulfillment windows.**
3. **Actual occupied chef work.**

Method windows do not create additional chef resources. A delivery or pickup window may contain several orders. Actual preparation, travel, delivery or handoff work must still be represented and checked.

The exact interaction between global closures, method exceptions and previously confirmed occurrences remains a product decision. The implementation must preserve existing global time-off behavior and must not invent a method-specific override that bypasses it.

Do not automatically apply the existing experience-based “all” advance-notice rules or private-event six-month search bound to meal prep. Define meal-prep applicability through the approved method-scheduling policy.

Availability saves must preserve the existing complete-snapshot semantics for maps; deleted days/exceptions must not reappear through JSON deep merging. Add version checks to prevent one editor silently overwriting another.

### 3.5 Shared actual-time reservation protection

Use a shared PostgreSQL reservation projection with one exclusion constraint covering all active occupied intervals for the same chef resource.

Each reservation identifies:

- Chef resource.
- Source kind and source ID.
- Actual occupied start/end, using half-open intervals.
- Operational claim ownership where applicable.
- Source version and active/released state.

Use an explicit resource key for the existing chef/store. Do not infer identity from `acceptedBy`, customer ID or payment account.

**Private-event integration**

Preserve existing acceptance claims, snapshots, compensation and rescheduling restrictions. Add a database integration migration that synchronously projects existing private-event occupied intervals into the shared reservation table.

Projection must occur in the same PostgreSQL transaction as the source change. An asynchronous subscriber is insufficient: it would allow an event and meal-prep visit to both confirm before either sees the other.

Use database triggers as the compatibility bridge for private-event claims and direct writers. Isolate this cross-module integration in a reviewed migration; do not let ordinary application services perform ad hoc writes into another module’s tables.

Retain the existing event-local constraints during transition. Verify projection parity before enabling meal-prep acceptance.

**Meal-prep integration**

- In-home occurrences reference exclusive actual work intervals.
- Delivery/pickup occurrences can link to a shared chef-planned preparation, delivery or handoff block.
- A shared work block has one reservation regardless of how many orders reference it.
- Adding orders never consumes count-based capacity.
- A pickup window itself does not create one exclusive appointment per order.
- Chef-planned work duration is explicit; do not derive it from an automatic servings-to-capacity formula.
- Changing or releasing a shared block must account for all linked occurrences.

**Rescheduling**

Approve a meal-prep reschedule through one transaction that checks current availability and replaces the affected occupied intervals and confirmed schedule reference. If any new interval conflicts, rollback preserves the old schedule and reservations.

Do not release the old interval before securing the replacement. Do not impose the private-event “cancel and recreate” restriction on meal prep, whose reschedules require approval and are explicitly in V1.

Serialize relevant Availability edits and schedule approvals so each approval uses a coherent settings revision. Settings changes must not silently cancel or move existing confirmed occurrences.

**Operational failures**

Uncertain in-progress claims remain visible for recovery. Do not introduce customer-facing expiry through a technical lease. Recovery must verify workflow ownership and side effects before releasing a claim.

Google Calendar cannot participate in the PostgreSQL transaction. Preserve current private-event behavior, expose lookup/sync health, and document that strict internal protection does not guarantee the absence of racing external edits. Meal-prep external-calendar enforcement requires the decision in section 5.

### 3.6 Dated offers, selection and intake

Each selection references a dated offer revision valid for the occurrence’s relevant week/date. Revalidate that relationship at approval.

A published-offer edit cannot mutate an already approved occurrence menu. Any replacement is a new revision requiring approval.

Support all four styles:

- Individual dish selections with quantities and servings.
- Packages with their selected dish/portion outcome.
- A chosen-menu visit.
- A tailored-plan request resulting in a chef-proposed occurrence menu.

Package and tailored-plan requests may exist before pricing is complete, but they cannot become payable through invented calculation rules.

Represent servings separately from price units. The contract has not resolved what “per dish” means relative to quantities and servings; schema fields must not accidentally choose that interpretation.

Intake must preserve general dietary/portion information across methods and conditionally request in-home equipment/access details. Fulfillment changes trigger review of newly applicable information. Do not expose home-access instructions through public offers, calendars, Stripe metadata or general logs.

### 3.7 Pricing and occurrence billing

A payable quote is an immutable snapshot tied to the exact approved occurrence menu and price.

Use:

- Explicit currency.
- Integer minor-unit amounts internally.
- Explicit, tested conversion at Medusa and Stripe boundaries.
- Separate cooking and approved fulfillment/grocery/other components.
- Exact approved payable total.
- Pricing and platform-fee policy versions.

Unknown values remain unknown. They must never become zero merely to allow payment.

Use dedicated occurrence-level Medusa orders and payment collections with meal-prep line metadata. Do not use event ticket products, `EVENT-` SKUs, party-size inventory, event additional-charge JSON or post-event ticket-capture jobs.

Create the billing obligation and outbox entry with menu/quote approval. Materialize external/module payment resources through an idempotent workflow, with durable links and reconciliation for partial completion.

The precise Medusa adapter must be validated against installed Medusa 2.7 interfaces before live payments. Failure to support the intended order shape is a technical blocker, not permission to reuse event tickets.

Platform-fee classification is explicit and required before collecting meal-prep payments. No fallback to ordinary-product or event-ticket fees.

### 3.8 Manual payment and autopay

**Without autopay**

- On chef approval of an exact menu and payable price, immediately enqueue the payment-link email.
- Record retries and delivery failures durably; an email outage must not undo approval.
- At the approved T-24h trigger, email a reminder if still unpaid.
- The reminder does not cancel the booking or decide whether service proceeds.

**With autopay**

- Require explicit customer opt-in and a valid account-scoped saved method.
- Collect card details using Stripe-hosted components; store provider references only.
- Charge each occurrence separately for its exact approved payable amount.
- Use no Stripe subscription and no per-occurrence spending cap.
- Resolve the trigger through a versioned product-approved payment timing policy.
- Do not substitute `service_start - 24 hours`.

Before dispatch, verify current consent, approved quote, connected account, payable balance, occurrence version and existing attempts.

**Failure or authentication requirement**

Keep the booking scheduled, email a payment link and create a chef-follow-up flag. Do not automatically cancel, reschedule, substitute a menu, or block fulfillment.

Transport retries reuse the same attempt and idempotency key. Retrying a declined charge as a new attempt requires an approved retry policy or authorized action; it is not an automatic consequence of worker retry.

**Concurrency and reconciliation**

- Manual payment and autopay share one payment orchestration lock and obligation.
- Persist an attempt before calling Stripe.
- Pass account-scoped idempotency keys through provider calls.
- Deduplicate webhooks by connected account and event ID.
- Verify amount, currency, account and quote identity before applying success.
- Reconcile ambiguous timeouts before allowing another attempt.
- Do not replace a payable quote while an old payment attempt is unresolved.
- Pending menu changes do not silently replace the currently approved quote.
- Post-payment adjustments and refunds remain policy-gated.

Autopay opt-out prevents undispatched future attempts. A payment already dispatched requires reconciliation; opt-out does not imply an automatic refund.

### 3.9 APIs, authorization and jobs

Add APIs under:

- `/admin/meal-prep` for offers, arrangements, occurrence reviews, quotes, approved changes, work planning and follow-up.
- `/store/meal-prep` for public offers and customer-authorized arrangements, occurrences, requests and payment actions.
- The existing `/admin/availability` surface for additive meal-prep scheduling settings.

Separate command endpoints from record editing. Provide explicit operations for arrangement approval, menu/quote approval, change submission/decision, payment-link creation and autopay consent/revocation.

Mutation contracts include an expected version and idempotency key. Repeated keys with identical payloads return the recorded result; reuse with different payloads returns a conflict.

Return structured errors for stale versions, actual-time conflicts, invalid dated offers, missing price approval and unresolved policy dependencies. Do not define a delivery/pickup count-capacity error.

Customer authorization must protect every private object by household/customer ownership. Keep the identity resolver separate from domain services until account-based access versus scoped links is decided. Public offer access does not authorize access to intake or bookings.

Use a PostgreSQL-backed outbox and durable job records for:

- Explicitly bounded recurrence materialization.
- Missed-selection checks.
- Payment-resource creation.
- Approved payment-trigger execution.
- Notifications.
- Stripe/webhook reconciliation.
- Reservation/sync integrity checks.

Jobs record policy/revision provenance and check applicability when executed. Deployments or worker restarts must not duplicate occurrences, emails or charges.

## 4. Explicit technical constraints

- PostgreSQL is authoritative for internal occupied-time exclusion; Redis is not the sole booking lock.
- No automatic order/serving capacity enforcement anywhere: database, API, UI, job or inventory adapter.
- No spending-cap field, consent clause or charge condition.
- No unknown or unapproved price may reach a payment attempt.
- No customer-facing policy may be inferred from a legacy default.
- No pending request may replace confirmed details.
- No asynchronous-only reservation projection.
- No private-event behavior change without compatibility design, migration and regression coverage.
- All three methods and four recurrence patterns remain V1 acceptance requirements.
- Product-policy dependencies block their own execution paths; they do not justify disabling unrelated independent work or inventing fallback behavior.

## 5. Unresolved decisions and implementation gates

These are explicit review requests for BTS-2. None is silently resolved here. Product decisions must be versioned before dependent implementation proceeds.

### D01 — Payment timing

Decide the T-24h clock, timezone and date/start anchor; DST behavior; late approvals/bookings; reschedules across the trigger; and whether any hard due time exists.

**Blocks:** Production trigger calculation, late-trigger catch-up, reminder scheduling and automatic charging. Durable worker infrastructure and exact-price approval can be implemented independently.

### D02 — Delivery area

Decide whether radius and ZIP lists can coexist, their combination semantics, address validation and inconclusive/out-of-area behavior.

**Blocks:** Final delivery eligibility and out-of-area customer flow. Radius and ZIP configuration structures can be prepared. Paid out-of-area delivery remains unapproved.

### D03 — Method schedules, locations and fees

Decide pickup location, method windows, closure precedence, applicability of advance-notice rules, and non-delivery fulfillment fees.

**Blocks:** Customer-selectable meal-prep windows and final location/fee validation. Existing Availability behavior must remain intact.

### D04 — Cooking, package and tailored-plan pricing

Decide per-dish versus per-serving semantics, package composition/pricing and tailored-plan pricing mechanics.

**Blocks:** Production price calculation for affected styles. Dated offers, serving capture, requests and immutable approval infrastructure can proceed.

### D05 — Grocery approach and payment terms

Define supported chef configurations, including grocery amounts, receipts/true-ups, deposits and payment terms, and their relationship to per-occurrence approval and payment emails.

**Blocks:** Grocery/payment-term calculation and any charge whose final payable amount depends on those rules. No default “included,” “at cost,” reimbursement or deposit policy.

### D06 — Cancellation, refunds and changed prices

Decide cancellation eligibility/effects, refunds and fees, post-payment price changes, and treatment of payments when an occurrence is skipped or rescheduled.

**Blocks:** Applying those commercial transitions and automatic financial adjustments. Requests, audit records and review queues can proceed.

### D07 — Pause effects

Decide how an approved pause affects generated occurrences, approved menus, reservations and payments.

**Blocks:** Applying a pause to existing occurrences. Recording a pause request does not itself change them.

### D08 — Unpaid service

Decide what the chef/customer may do when service approaches with an unpaid balance, including operational authority and any restrictions.

**Blocks:** Final unpaid-service fulfillment behavior. Payment failure must still preserve the booking, send a link and flag follow-up. No block-unpaid-fulfillment rule is approved.

### D09 — Recurrence boundaries and conflicts

Decide materialization horizon, end conditions, replenishment, arrangement changes affecting existing occurrences, and whether partial conflicts require all-or-nothing or explicit partial approval.

**Blocks:** Production recurring materialization and series confirmation behavior. The four pattern generators can be implemented and tested with explicit bounds.

### D10 — Customer access

Choose authenticated customer accounts, scoped secure links, or an explicitly defined combination, including household access and payment-link authentication.

**Blocks:** Production customer access and link delivery. Ownership rules and provider-independent authorization interfaces can proceed.

### D11 — Platform fee classification

Decide how meal-prep cooking, grocery and fulfillment components are classified for platform fees.

**Blocks:** Live payment collection. No event/product classification fallback.

### D12 — External-calendar assurance

Confirm whether meal prep retains the current advisory Google failure behavior or requires a different availability guarantee, including disconnected/stale/error handling.

**Blocks:** Claims that external calendar conflicts are strictly prevented and any changed Google failure behavior. PostgreSQL protection of internal actual work remains mandatory.

**Excluded, not unresolved:** Automatic delivery/pickup count caps and per-occurrence spending caps. They are not review options within this V1 proposal.

## 6. Test and acceptance plan

These are required future validations, not tests reported as executed in this read-only review.

- **T01 — Contract and policy gates.** Full v1.1/r4 text and assigned objective appear in coding handoffs. Each applicable unresolved dependency prevents its dependent action without inventing defaults. Every PR maps requirements to tests and lists migrations/deviations.

- **T02 — Fulfillment and intake.** Test independent method enablement; all three method flows; relevant conditional intake; shared dish/base prices; free in-area delivery; absence of paid out-of-area behavior; and approved area/window policy cases once decided.

- **T03 — Offers and selection styles.** Exercise all four styles, dated eligibility, serving capture, expired/stale offers, immutable approved menus and unknown pricing. Package/tailored requests cannot accidentally become payable.

- **T04 — Manual capacity.** Multiple delivery/pickup orders sharing a window remain eligible regardless of counts, subject to actual-time/date checks. Counts never affect acceptance. Linking orders to one work block creates no additional exclusive reservation. No automatic pickup appointment or remaining-capacity display.

- **T05 — Recurrence and approvals.** Weekly, fortnightly across year boundaries, multiple weekly slots and irregular custom dates. Test retries, duplicate jobs, stable keys, DST gaps/folds, reschedules, skip tombstones, pauses and partial conflicts under approved rules. Arrangement approval never approves occurrence menus. Missed selections create flags without repetition, substitution or cancellation.

- **T06 — Shared PostgreSQL races.** Concurrent private-event and meal-prep acceptance; overlapping in-home visits; shared work-block scheduling; adjacent half-open intervals; stale approval; failed replacement preserving the original reservation; settings-save races; direct-write attempts; and recovery of interrupted claims.

- **T07 — Availability and Google regression.** Preserve existing global hours/time off, date exceptions, private-event notice rules, settings navigation, complete-snapshot saves and unsaved-edit behavior. Test inherited accepted-event guards, mirrored events, Google edits and advisory failures. Verify private-event horizon is not reused as meal-prep recurrence policy.

- **T08 — Exact approved pricing.** Unknown price cannot charge; servings and billing units remain distinct; base prices do not vary by method; separate components sum exactly; currency conversions round-trip correctly; quote revisions are immutable; stale links and unresolved attempts cannot charge replaced amounts. Include amounts such as USD 10.00 to catch integer-based unit guessing.

- **T09 — Payments and consent.** No opt-in means no off-session charge. Exact approved amount, account scoping, revoked consent, unavailable account, worker restart, timeout after Stripe success, manual/autopay races, duplicate/out-of-order webhooks, authentication requirements and declined payments. Booking remains scheduled on failure. No subscription or spending cap.

- **T10 — Timing and notifications.** Immediate manual-payment email outbox creation; delivery retry without duplicate obligations; missed-selection notification; failed-autopay link and follow-up; paid-before-reminder race. Once D01 is resolved, test its exact clock/timezone/DST/late-approval rules.

- **T11 — Authorization and privacy.** Cross-customer and cross-household access, chef ownership, forged references, revoked/expired credentials for the selected access mechanism, and restricted intake visibility. No raw card data or home-access instructions in logs, public APIs or payment metadata.

- **T12 — Private-event commerce regression.** Existing acceptance, ticket inventory, additional charges, payment authorization/capture, fulfillment, emails and receipts. Provider idempotency improvements must not change legacy amounts, account selection, capture timing or fees.

- **T13 — Migration and recovery.** Fresh install and upgrade from Availability baseline; active/completed/soft-deleted events; missing duration and legacy overlap audits; in-progress claims; reservation projection parity; transactional trigger failures; interrupted order creation; and rollback with active meal-prep reservations.

- **T14 — Decisions incorporated correctly.** For each approved D01–D12 decision, add fixtures covering its chosen behavior and rejected alternatives. A release cannot claim full V1 support while required policy-dependent paths remain disabled.

Run the existing unit suites, isolated PostgreSQL integration suites, workspace typechecks and builds, plus rendered UI tests. Use disposable databases and Stripe/Google test resources for end-to-end verification. Do not treat skipped PostgreSQL suites as passing concurrency coverage.

## 7. Proposed PR sequence

Every PR cites contract v1.1/r4 or its explicit successor, requirement/test mappings, migrations, regression exposure and deviations. Each requires review; none may merge automatically.

### PR 1 — Baseline, contract and additive foundations

Verify the implementation base contains Availability and its deployment fix. Add full contract provenance, domain types, additive schema, revision/approval/audit/outbox/idempotency foundations and disabled feature controls.

**Maps:** R01, R11–R12, R19–R20.  
**Validation:** T01, initial T11/T13.  
**Gate:** No unresolved customer policy is encoded as a schema default.

### PR 2 — Shared occupied-time protection

Add the shared reservation table, synchronous private-event projection, migration/backfill checks and cross-domain concurrency tests. Retain existing private-event constraints and acceptance behavior.

**Maps:** R09, R19.  
**Validation:** T06–T07, T12–T13.  
**Gate:** Reviewed integration migration and verified reservation parity before meal-prep acceptance is enabled.

### PR 3 — Availability extension and chef service setup

Extend existing Availability with meal-prep settings; add independent method/style enablement, work-block planning and advisory order/serving summaries.

**Maps:** R02, R07–R09.  
**Validation:** T02, T04, T07.  
**Gate:** D02/D03/D12 for dependent production scheduling behavior. No new standalone Availability screen.

### PR 4 — Dated offers, intake and customer authorization

Implement offer revisions, all four selection-style request models, serving capture and conditional intake. Add customer ownership enforcement.

**Maps:** R03–R07, R14, R18.  
**Validation:** T02–T03, T11.  
**Gate:** D04/D05 for pricing behavior and D10 for the customer access mechanism.

### PR 5 — Arrangements, four-pattern recurrence and approval workflows

Implement generators with explicit bounds, occurrence identity, arrangement/menu approvals, requested changes, missed-selection handling and atomic schedule replacement.

**Maps:** R10–R13.  
**Validation:** T05–T07, T10.  
**Gate:** D07/D09 and relevant D06 decisions before applying affected pause/skip/reschedule outcomes.

### PR 6 — Approved-price billing and manual payment links

Implement exact quote snapshots, dedicated Medusa payment adapters, immediate email dispatch, provider idempotency, webhook deduplication and reconciliation.

**Maps:** R05–R06, R15–R19.  
**Validation:** T08–T12.  
**Gate:** D04/D05/D10/D11 before live collection; D06 before paid-price adjustments or refunds.

### PR 7 — Optional autopay and timed reminders

Implement Stripe saved-method setup, explicit opt-in/revocation, durable attempts, approved trigger calculation and failure recovery.

**Maps:** R15–R18.  
**Validation:** T09–T10, T12–T13.  
**Gate:** D01 and applicable payment terms must be resolved. No spending-cap feature.

### PR 8 — Fulfillment, migration rehearsal and full V1 release validation

Complete method-specific execution UX, chef follow-up, approved unpaid/cancellation behavior, end-to-end flows, observability and rollout rehearsal.

**Maps:** All requirements.  
**Validation:** T01–T14.  
**Gate:** All decisions required for complete V1 behavior are incorporated; all three fulfillment methods and four recurrence patterns pass acceptance.

Independent infrastructure may be reviewed before policy decisions. A blocked dependent PR must remain blocked; implementers must not fill the gap with a “reasonable” product default.

## 8. Migration, rollout and handoff

### Migration and rollout

Use additive schema and explicitly ordered integration migrations. Audit active legacy occupied intervals and in-progress claims before backfill. Preserve the Availability fix for soft-deleted bookings.

Enable in stages:

1. Internal data and reservation-projection verification.
2. Chef administration and review workflows.
3. Authorized customer selection and arrangements.
4. Manual payments.
5. Optional autopay.

These are release stages, not a reduction of V1 scope.

Monitor reservation conflicts/projection drift, stuck approvals, recurrence conflicts, overdue selections, unsent emails, ambiguous payment attempts, webhook mismatches and chef-follow-up queues.

Disabling meal prep must stop new actions without deleting confirmed obligations, reservations or payment history. Do not remove shared protection while active meal-prep work exists. Rollback planning must preserve financial reconciliation and private-event compatibility.

### Coding handoff requirements

Before any coding session:

- Supply the **full exact contract text**, its version/revision and the assigned Arbor objective in the prompt or a verified workspace file. Links and this mapping alone are insufficient.
- State applicable requirements, unresolved decisions, draft conflicts, tests and intended migrations before editing.
- Reverify repository identity and current baseline.
- Implement only work independent of unresolved policy.
- Request blocking product decisions in Arbor through an authorized participant.
- Require review before merge.

**Review disposition requested:** Review this technical proposal and resolve the named product decisions separately. Architecture approval must not be interpreted as blanket approval of those policies.

**Transfer note:** This proposal was published to BTS-3 by ChatGPT after the T3 session. The T3 agent made no repository modification, commit, push or PR.

Recovery provenance: full text from prior T3 handoff `mcp:c7d5a5a3-2468-4e6d-b60a-e0359b7ac7bb`, original message dated 2026-10-31. Recovered before PR8 edits. Historical baseline and validation statements above describe that original proposal, not the current stack.

