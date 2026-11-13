# Meal Prep V1 — Requirements Contract
Version: 1.1 · 2026-10-29 · Status: consolidated confirmed decisions; NOT blanket approval to implement unresolved policies.

## Authority and precedence
This contract distills explicit product decisions in Arbor BTS-2. New explicit product decisions in BTS-2 supersede this version once incorporated and version-bumped. Technical architecture proposals (including BTS-3 and T3 sessions) are subordinate. Where an implementation choice would establish an unresolved customer-facing policy, stop and request a product decision. Do not infer approval from silence.

Sources: [BTS-2 decision history](https://arborthreads.com/threads/thr_d3aaf82d-68a9-4a5f-b231-4aec14bc840a/define-the-first-meal-prep-service-experience), [BTS-2 requirements/template review](https://arborthreads.com/artifacts/art_151704ba-ea53-48b7-8231-aba8a8d0ac14/meal-prep-service-requirements-and-template-review), [BTS-3 architecture draft](https://arborthreads.com/artifacts/art_91901e4d-f610-4dbb-8e23-1fa86e11e876/bts-3-t3-architecture-proposal-review-draft).

## Confirmed product requirements
- **Fulfillment:** Chef independently enables in-home cooking, delivery, and pickup. All three are in V1; this supersedes the original in-home-only decision.
- **Menu/selection:** Chefs enable supported selection styles (individual dishes and quantities, packages, chosen-menu visit, tailored-plan request). Exact initial package/tailored-plan pricing mechanics remain open. Customers choose only dishes offered for their relevant week/date, and specify servings for each dish.
- **Prices:** Cooking service fee is per dish or serving; same dishes and base prices across fulfillment methods. Fulfillment fees, if any, are separate. Chefs choose grocery pricing approach and payment terms, but supported configurations are not yet specified.
- **Delivery:** Free within a chef-defined area. Chef can configure radius around an address and ZIP-code lists. Whether both can be active simultaneously/how they combine and out-of-area handling remain open. No paid out-of-area delivery has been approved.
- **Capacity:** Chef MANUALLY assesses delivery/pickup capacity. V1 has NO automatic order-count/serving-count caps, no remaining-capacity calculation, and NO capacity-based rejection. Order/serving summaries for chef review are recommendations only. Actual chef occupied time and date/window availability still require protection.
- **Availability:** Extend the EXISTING admin Availability screen; retain current private-event scheduling and global time off. Meal-prep scheduling must avoid double-booking actual chef occupied time with private events. Pickup orders must not automatically consume an exclusive full chef appointment.
- **Recurrence:** Weekly fixed day/time, every two weeks, multiple visits per week, and custom agreed dates ALL supported in V1. Each arrangement is chef-approved once. Each occurrence's initial menu is chef-approved separately. All requested menu/portion changes, reschedules, skips and pauses require chef approval. Pending changes must not replace confirmed details until approval.
- **Missed selections:** If customer misses chef's menu-selection deadline, flag for chef/customer resolution; no automatic repeat, substitution or cancellation.
- **Intake:** Allergies/dietary restrictions/preferences, household size/portion preferences, kitchen equipment/storage/containers, address/home-access instructions. Apply in-home-specific questions conditionally for fulfillment method.
- **Payments:** Per occurrence, not an automatic subscription. Customer can opt into autopay 24 hours before agreed date. Exact clock/timezone anchor is OPEN. Without autopay, email payment link immediately after chef approves occurrence menu and price. If still unpaid at T-24h, email reminder (not a hard deadline/cancellation rule). If autopay fails or requires authentication, KEEP booking scheduled, email payment link, flag for chef follow-up. Do not charge an unapproved or unknown price.

## Excluded T3 proposal
The T3 per-occurrence spending-cap proposal is disregarded for V1. It is not approved and is not pending approval. Optional autopay uses the exact chef-approved amount. A spending cap would require a new product decision.

## Explicitly unresolved — no autonomous product policy choices
1. T-24h anchor: clock, timezone, service date versus start; late approvals/late bookings and hard due time.
2. Radius/ZIP combination, address validation, out-of-area behavior; pickup location, method windows and closure precedence; any non-delivery fulfillment fees.
3. Per-dish versus per-serving price semantics, packages and tailored plans, grocery true-ups/deposits, chef-configurable payment terms.
4. Cancellation/refund rules, post-payment price changes, pauses affecting already-generated occurrences, unpaid service/fulfillment policy.
5. Recurrence materialization horizon/end/partial conflicts, customer access mechanism, platform fee classification.
6. The T3 spending-cap idea is excluded from V1; it is not pending approval.

## Hard exclusions and regression protections
- No automatic delivery/pickup capacity quotas, rejection, or 'sold out' logic based on serving/order counts.
- No assumption T-24h means exactly 24 elapsed hours before service start.
- No automatic cancellation for missing menu selections or payment failures.
- No reusing private-event ticket products or guest-count limits for meal-prep servings without an approved design.
- No changes to existing private-event checkout/acceptance behavior without explicit migration, compatibility, and regression coverage.
- No storing raw card details; no autopay without customer opt-in and exact approved payable amount.

## T3 handoff / implementation gate
Before any coding session: provide the FULL TEXT of this exact version and the assigned Arbor thread objective in the T3 prompt or verified workspace file. URLs alone are insufficient. Agent must state contract version, enumerate applicable requirements, open questions, conflicts and tests before edits. If contract unavailable, STOP. Technical improvements may be proposed but cannot override confirmed decisions. If an unresolved policy blocks a task, implement only independent work and request a decision in Arbor. PRs must cite contract version, requirement-to-test mapping, migrations, regressions and any deviations. No merge until reviewed.

## BTS-3 architecture reconciliation
Preserve dedicated meal-prep occurrence/menu/approval/billing design, shared actual-chef-time reservation protection, idempotent Stripe Connect payments, and separate fulfillment status. REMOVE T3 proposed automatic batch serving/order caps and capacity-based rejection. MARK as unapproved: fixed T-24h service-start anchor, block-unpaid-fulfillment rule, cancellation/refund defaults, eight-week recurrence horizon, and any spending-cap feature (excluded from V1). Validate all four recurrence patterns and existing Availability admin integration.
