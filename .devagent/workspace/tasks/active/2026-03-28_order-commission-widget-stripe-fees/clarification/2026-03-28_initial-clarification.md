# Clarified Requirement Packet — Order commission widget: Stripe processing fees line

- Requestor: PabloJVelez (inferred — task hub owner)
- Decision Maker: PabloJVelez `[INFERRED]`
- Date: 2026-03-28
- Mode: Task Clarification
- Status: Complete
- Related Task Hub: `.devagent/workspace/tasks/active/2026-03-28_order-commission-widget-stripe-fees/`
- **Plan readiness:** Ready for `devagent create-plan` (v1 scope and UX decided; implementation details for persistence in plan).

## Task overview

### Context

- **Task name/slug:** `2026-03-28_order-commission-widget-stripe-fees`
- **Business context:** Admin **Payout summary** on Medusa orders should show **Stripe processing fees** as its own line so gross → deductions → chef take-home reads clearly. Connect charges the platform; product intent is to **pass processing cost through to the chef** when that mode is enabled (`passStripeFeeToChef`).
- **Stakeholders:** PabloJVelez (requestor / decision maker) `[INFERRED]`
- **Prior work:** Research `research/2026-03-28_stripe-processing-fee-line-order-widget.md`; completed task `2026-03-20_admin-order-commission-widget`.

### Clarification sessions

- Session 1 (2026-03-28) — Round 1: Q1–Q3 answered (PabloJVelez). No further rounds required for v1.

---

## Question tracker

| ID | Topic | Status | Answer summary |
| --- | --- | --- | --- |
| Q1 | What number should “Stripe processing fees” represent? | ✅ answered | **A** — **Estimated** fee only, same rule as provider (e.g. percent + flat cents on charged amount), available via persisted `payment.data` (or equivalent) so admin stays self-contained. |
| Q2 | When pass-through to chef is **off**, Stripe fees line? | ✅ answered | **A** — **Hide** the line; keep summary as today (charged, platform commission, chef take-home). |
| Q3 | Primary label for the row | ✅ answered | **A** — **Stripe processing fees** (neutral). |

---

## Stakeholder decisions (2026-03-28)

| # | Question | Answer |
| --- | --- | --- |
| 1 | Fee source (v1) | Estimated only (provider-aligned formula). |
| 2 | Pass-through off | Do not show a Stripe fees row. |
| 3 | Copy | Neutral: “Stripe processing fees”. |

---

## Clarified requirements

### Scope & end goal

**What needs to be done?**

- Extend the **Payout summary** widget for **stripe-connect** orders so that when **pass-through of Stripe processing fees to the chef** was active for that payment, operators see an extra row **Stripe processing fees** using the **same estimated amount** the provider uses (configurable `stripeFeePercent` + `stripeFeeFlatCents`).
- **Platform commission** and **chef take-home** must stay **arithmetically consistent** with Stripe Connect: chef take-home remains **gross charge − `application_fee_amount`** (unchanged definition). The new row **explains** part of that application fee as processing estimate when pass-through is on; **platform commission** in the UI should represent the **remainder** (`application_fee_amount` − estimated Stripe fee), not the full application fee, so three deduction lines sum to the application fee.

**When pass-through is off**

- **Do not render** the Stripe processing fees row.
- **Platform commission** continues to mean the full **`application_fee_amount`** (current behavior).

**In-scope (must-have)**

- v1 uses **estimated** processing fee only (no Balance Transaction / actual fee requirement).
- Amounts in **smallest currency unit**; currency from order / payment.
- No Stripe API calls from the **browser**.

**Out-of-scope (v1)**

- Displaying **actual** Stripe fees from Balance Transactions.
- Changing storefront or customer-facing copy.

**Nice-to-have (defer)**

- Actual fee row or footnote once persistence/webhook path exists.

### Technical constraints & requirements

- Persist enough on **Medusa payment `data`** (or provider return paths that merge into it) that the admin widget can: (1) know whether **pass-through was on** for that capture, and (2) show **estimated Stripe fee** without reading server env from the admin bundle.
- Wire **`passStripeFeeToChef`** (and fee % / flat) from **config/env** if not already, so behavior matches operator intent (see research: `medusa-config` currently omits these options).
- Align **per-line fee** path with gross-up when both `feePerUnitBased` and `passStripeFeeToChef` are enabled (research flagged inconsistency) — include in plan as fix or explicit follow-up.

### Implementation approach (for plan; not architecture sign-off)

- Provider: when `passStripeFeeToChef` is true at **initiate/authorize/capture**, persist e.g. `stripe_processing_fee_estimate` (smallest unit) and optionally `platform_commission_amount` or infer remainder from `application_fee_amount − estimate`.
- Widget: if estimate field absent or pass-through was off → **omit** Stripe row; else show **Stripe processing fees** as `−estimate`, **Platform commission** as `−(application_fee − estimate)`.

### Acceptance criteria & verification

- [ ] With **pass-through on**, order detail shows: Charged → **Stripe processing fees** (estimated) → **Platform commission** (net of that estimate) → **Chef take-home**; numbers reconcile to gross − `application_fee_amount`.
- [ ] With **pass-through off**, **no** Stripe fees row; platform commission = full `application_fee_amount`.
- [ ] Non–stripe-connect or missing payment data: existing hide / empty behavior preserved.
- [ ] Manual check against at least one real Connect order in admin.

---

## Assumptions log

| Assumption | Owner | Validation required |
| --- | --- | --- |
| Single primary stakeholder (Pablo) | Agent | ✅ answered via Round 1 |
| “Pass-through on” per order matches provider config at payment time | Engineering | Persist flag or fields at capture so historical orders stay correct |

---

## Gaps requiring research

- None for v1 scope (actual fees explicitly out of scope).

---

## Clarification session log

| Round | Date | Questions | Outcome |
| --- | --- | --- | --- |
| 1 | 2026-03-28 | Q1–Q3 | **1: A, 2: A, 3: A** — PabloJVelez |

---

## Next steps

- Run **`devagent create-plan`** using this packet + `research/2026-03-28_stripe-processing-fee-line-order-widget.md`.
- Implement per plan (`implement-plan` or explicit build request).

---

## Change log

| Date | Change |
| --- | --- |
| 2026-03-28 | Initial packet; Round 1 questions recorded |
| 2026-03-28 | Q1–Q3 answered; clarified requirements filled; status **Complete** |
