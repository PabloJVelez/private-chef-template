# Clarified Requirement Packet — Admin order commission visibility

- Requestor: PabloJVelez (inferred from git config / task hub)
- Decision Maker: PabloJVelez `[INFERRED]`
- Date: 2026-03-20
- Mode: Task Clarification
- Status: Complete
- Related Task Hub: `.devagent/workspace/tasks/completed/2026-03-20_admin-order-commission-widget/`

## Task Overview

### Context

- **Task name/slug:** Admin order commission widget (`2026-03-20_admin-order-commission-widget`)
- **Business context:** Chefs (merchants) should see how much platform commission was taken per order, aligned with Stripe Connect / PaymentIntent application fee behavior.
- **Stakeholders:** PabloJVelez (session owner) `[INFERRED]`
- **Prior work:** Task hub `AGENTS.md`; research `research/2026-03-20_admin-order-commission-visibility.md` (fee on PI, provider `data` merge risk, Medusa zones `order.details.*`).

### Clarification Sessions

- Session 1: 2026-03-20 — Async clarification; Q1–Q3 answered (order detail only; provider persistence fix required for v1; label “Platform commission”).

---

## Question tracker

| ID | Topic | Status |
| --- | --- | --- |
| Q1 | Admin surface (list vs detail vs both) | ✅ answered — **A** (order detail widget only) |
| Q2 | Behavior when fee missing from stored payment `data` | ✅ answered — **C** (enrich Stripe provider `authorize`/`capture` `data` first; no on-demand Stripe fetch or empty-state-only MVP) |
| Q3 | User-facing label for the amount | ✅ answered — **A** (“Platform commission”) |

---

## Clarified Requirements

### Scope & End Goal

**What needs to be done?**

1. Ensure **Medusa-persisted payment data** includes **`application_fee_amount`** (and enough context to display it) after authorization/capture by **extending the stripe-connect payment provider** return payloads—this is **required before** relying on the admin UI (`authorizePayment` / `capturePayment` currently omit the fee; see research packet).
2. Add a **Medusa Admin widget** on the **order detail** page (injection zone such as `order.details.side.after` or `order.details.after`) that shows **“Platform commission”** using that persisted data for the relevant **stripe-connect** payment.

**End state:** Chefs open an order in Admin and see a clear **Platform commission** line when Connect applied a fee; data is trustworthy because the provider persists it.

**In-scope (must-have):**

- Order **detail** page only (no orders list column in v1).
- Provider changes so fee survives the payment lifecycle in stored `data`.
- Widget with heading/label **Platform commission** and formatted amount (smallest currency unit → display using order currency).
- Sensible behavior when Connect is off or fee is zero (product choice: show **$0.00** vs hide section—recommend **show 0 or “No platform commission”** for Connect-on with zero fee; **hide or N/A** when provider is not stripe-connect—document in plan).

**Out-of-scope (v1):**

- Orders **list** column.
- **On-demand** Stripe API from admin to backfill fee.
- Relying on **empty state only** without fixing persistence (explicitly rejected).

**Nice-to-have (defer):**

- Orders list column; per-line fee breakdown; historical backfill job.

---

### Technical Constraints & Requirements

- Must align with **Medusa v2** admin widgets (`defineWidgetConfig`, `DetailWidgetProps<AdminOrder>`).
- Must not expose **Stripe secret** to the browser; any Stripe retrieve stays server-side inside the provider (already the case).
- Amounts: Stripe / Medusa **smallest currency unit** for display formatting.

---

### Dependencies & Blockers

- Depends on **payment module** merge semantics for provider `data` (research flagged verify with real order)—implementation spike if merge still drops fields.

---

### Implementation Approach

- Reuse existing patterns: `apps/medusa/src/admin/widgets/stripe-connect-store-widget.tsx` for admin SDK widget style.
- Extend `apps/medusa/src/modules/stripe-connect/service.ts` so **`authorizePayment`** and **`capturePayment`** (and **`retrievePayment`** if needed for consistency) return **`application_fee_amount`** from the retrieved **PaymentIntent**, consistent with **`StripeConnectPaymentData`** in `types.ts`.

---

### Acceptance Criteria & Verification

- [ ] After a test order with Connect + non-zero fee, **Admin GET order** (or UI) shows **`application_fee_amount`** on the captured payment/session `data`.
- [ ] Order detail shows **Platform commission** matching that value (formatted).
- [ ] Manual check: Connect off or non–stripe-connect order does not mislead (per plan’s empty/hide rules).
- [ ] Optional: unit/integration tests for provider return shape if the project tests providers.

---

## Assumptions Log

| Assumption | Owner | Validation Required | Validation Method | Status |
| --- | --- | --- | --- | --- |
| “Commission” = Stripe `application_fee_amount` for Connect destination charges | PabloJVelez | No | Q3 + Q1–Q2 | Validated |
| Primary user is the chef using Medusa Admin | PabloJVelez | No | Task text | Accepted |
| Persisted `data` merge will retain fields once provider returns them | PabloJVelez | Yes | Spike on real order JSON | Pending implementation |

---

## Gaps Requiring Research

- **Spike during implementation:** Confirm one real order’s persisted `payments[].data` / session `data` after provider change (already noted in research checklist).

---

## Clarification Session Log

### Session 1: 2026-03-20

**Participants:** PabloJVelez (async)

**1. Where should chefs see commission for the first shippable slice?**  
→ **A.** Order detail only (widget).

**2. If Medusa-stored payment `data` does not include `application_fee_amount`, what is acceptable?**  
→ **C.** Fix persistence in the Stripe provider first (enrich `authorize` / `capture` `data`); no separate fallback in v1.

**3. Preferred merchant-facing label?**  
→ **A.** “Platform commission”.

---

## Next Steps

### Spec / plan readiness

**Status:** Ready for plan

**Rationale:** Scope, persistence strategy, surface, and copy are decided. Remaining work is technical verification (merge behavior) inside implementation/plan tasks.

**Recommended:** `devagent create-plan` using this packet + `research/2026-03-20_admin-order-commission-visibility.md`.

---

## Change Log

| Date | Change |
| --- | --- |
| 2026-03-20 | Initial packet; session 1 questions 1–3 posed |
| 2026-03-20 | Q1=A, Q2=C, Q3=A; requirements filled; status Complete |
