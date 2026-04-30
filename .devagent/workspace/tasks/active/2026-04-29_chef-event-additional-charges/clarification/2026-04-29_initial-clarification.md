# Clarified Requirement Packet — Chef Event Additional Charges

- Requestor: PabloJVelez (Owner)
- Decision Maker: PabloJVelez (Owner)
- Date: 2026-04-29
- Mode: Task Clarification
- Status: Complete
- Related Task Hub: `.devagent/workspace/tasks/active/2026-04-29_chef-event-additional-charges/`
- Notes: Invocation had no explicit input context; this packet starts from inferred context and validates assumptions through interactive Q&A.

## Task Overview

### Context
- **Task name/slug:** `2026-04-29_chef-event-additional-charges`
- **Business context:** Extend chef event payments so chefs can define event-level additional charges that hosts pay once, integrated into the existing Medusa cart/checkout flow.
- **Stakeholders:** PabloJVelez (requestor + decision maker).
- **Prior work:** Task hub `AGENTS.md`; scope brief at `/Users/pablo/Downloads/private-chef-event-additional-charges.md`.

### Clarification Sessions
- Session 1: 2026-04-29 — Inferred-task kickoff and requirement validation (in progress)

---

## Inferred Task Concept

Implement support for chef-defined, event-scoped additional charges that are billed once through the accepted-event storefront checkout flow, with proper admin editing, cart composition, line-item labeling, and paid-state tracking.

## Assumptions

- [INFERRED] Stakeholders and decisions are currently single-owner (`PabloJVelez`) unless delegated.
- [INFERRED] Clarification scope is **full task validation** (not only gap-fill), because this run was started from `/clarify-task` on a newly scaffolded task hub.
- [INFERRED] Mission alignment is to improve reusable private-chef template functionality while preserving existing Medusa patterns.

---

## Clarified Requirements (Working Draft)

### Scope & End Goal

**Known so far**
- Additional charges are event-level rows with per-row state (`pending|paid|void`), not one global paid flag.
- Charges should appear in first-payment checkout and disappear per row after successful payment.
- Solution should remain Medusa-native (cart/order flow), not draft-order-first.
- Cart policy for v1: exclusive carts (`one event per cart`, no non-event catalog mixing).
- Refund/cancel handling for charge rows in v1: case-by-case admin decision (no fully automatic reopen rule).
- Charge-line controls in v1: strict mode (host cannot remove/edit one-time charge lines in cart).
- After pending charges are paid, minimum ticket quantity returns to normal minimum of `1`.
- Paid rows are immutable in admin (`name` and `amount` read-only once paid).
- Pending-row delete semantics in v1 use soft-delete (`status = void`) for auditability.

**In-scope (must-have)**
- `ChefEvent.additionalCharges` row model with per-row state (`pending|paid|void`) and per-row paid markers.
- Admin edit UX for additional charges where pending rows are editable, paid rows read-only, and deletes map to `void`.
- Event-cart initialize workflow/route that synchronizes ticket line + pending charge lines and enforces event-cart exclusivity.
- Strict checkout behavior for charge lines (non-removable/non-editable by host).
- Mark rows paid when an order containing charge lines is created; preserve manual case-by-case handling for refund/cancel reversals.
- Post-charge behavior: once pending charges are fully paid, minimum ticket quantity returns to `1`.

**Out-of-scope (won't-have for v1)**
- Fully automated reopen/reversal logic on refund/cancel outcomes.
- Mixed catalog + event payment cart behavior.
- Flexible customer-side charge-line override/removal.

### Dependencies & Blockers

- No blocking requirement gaps remain from clarification.
- Implementation still depends on existing event-product, checkout, and workflow surfaces in `apps/medusa` and `apps/storefront` as documented in task references.

### Acceptance Criteria & Verification

- Admin can create/update pending additional charge rows for a chef event.
- Admin cannot edit `name` or `amount` for rows once marked `paid`.
- Deleting a pending row sets it to `void` (soft-delete), not hard-delete.
- Event checkout cart can contain only one event context and no mixed catalog items in v1.
- Host cannot remove/edit one-time additional-charge lines in cart during v1 checkout flow.
- Additional-charge rows are billed once; after successful order creation containing the corresponding line, row transitions to `paid`.
- If refund/cancel occurs, row-state changes are manual/admin case-by-case (no automatic reopen in v1).
- After all pending additional charges are paid, minimum ticket purchase rule returns to quantity `1`.

---

## Question Tracker

| ID | Question | Status | Latest Answer |
| --- | --- | --- | --- |
| Q1 | What is the v1 policy when an order with additional-charge lines is canceled/refunded? | ✅ answered | D — Case-by-case via admin action |
| Q2 | Should event checkout carts be exclusive (single event + no mixed catalog items) in v1? | ✅ answered | A — Yes: one event per cart, no non-event products |
| Q3 | In v1, should hosts be able to remove pending additional-charge lines from cart? | ✅ answered | A — No; strict mode (remove/edit disabled) |
| Q4 | After all pending additional charges are paid, what should minimum ticket quantity be for future purchases? | ✅ answered | A — return to normal minimum of 1 |
| Q5 | Once a charge row is paid, can admins edit name/amount? | ✅ answered | A — No; paid rows read-only |
| Q6 | When deleting a pending charge row in admin, what should happen? | ✅ answered | A — Soft-delete by setting `status = void` |

---

## Gaps Requiring Research

- None required to unblock planning.
- Optional future research item (non-blocking): establish standardized refund/cancel operational playbook for manual charge-row reconciliation.

---

## Clarification Session Log

### Session 1: 2026-04-29
**Participants:** PabloJVelez (Requestor/Decision Maker), Agent

**Questions Asked:**
1. Refund/cancel policy for charge rows? → **D** (case-by-case via admin action) (PabloJVelez)
2. Event checkout cart exclusivity policy? → **A** (exclusive cart: one event, no mixed products) (PabloJVelez)
3. Host removal/edit of pending charge lines in cart? → **A** (disallow; strict mode) (PabloJVelez)
4. Minimum ticket quantity after pending charges are paid? → **A** (return to 1) (PabloJVelez)
5. Admin edits on paid rows? → **A** (paid rows read-only) (PabloJVelez)
6. Pending-row delete semantics? → **A** (soft-delete via `void`) (PabloJVelez)

**Unresolved Items:**
- None.

---

## Next Steps

### Spec Readiness Assessment
**Status:** ☑ Ready for Spec | ⬜ Research Needed | ⬜ More Clarification Needed

**Rationale:**
All critical policy and behavior decisions needed for planning are now explicit: cart policy, refund handling posture, host controls, admin mutability rules, deletion semantics, and minimum quantity transitions.

### Recommended Actions

- [ ] Run `devagent create-plan` using this packet and the external scope brief.
- [ ] Keep manual case-by-case refund reconciliation as an explicit implementation note in plan tasks.
- [ ] Include acceptance tests for exclusivity, immutability, soft-delete behavior, and one-time charge visibility transitions.

