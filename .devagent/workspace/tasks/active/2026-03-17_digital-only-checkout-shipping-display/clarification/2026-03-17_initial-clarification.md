# Clarified Requirement Packet — Digital-Only Checkout Shipping Display

- Requestor: Pablo (Founder/Developer)
- Decision Maker: Pablo (Product/UX DRI)
- Date: 2026-03-17
- Mode: Task Clarification
- Status: In Progress
- Related Task Hub: `.devagent/workspace/tasks/active/2026-03-17_digital-only-checkout-shipping-display/`

## Task Overview

### Context
- **Task name/slug:** digital-only-checkout-shipping-display
- **Business context:** The event checkout flow currently shows shipping lines even when the cart only contains digital event tickets, which can confuse guests expecting purely digital fulfillment. A sibling project already implements the desired behavior; this task brings this storefront in line with that behavior.
- **Stakeholders:** Pablo (Founder/Developer, Product/UX DRI)
- **Prior work:** Digital-only cart behavior implemented in a sibling project; AGENTS.md task hub for this task.

### Clarification Sessions
- Session 1: 2026-03-17 — Initial clarification via devagent clarify-task (decision-maker, parity expectations, mixed cart expectations).

---

## Clarified Requirements

### Scope & End Goal

**What needs to be done?**
Implement digital-only cart behavior for the storefront checkout order summary so that carts containing only digital items (e.g., event tickets) do not show Shipping or Estimated Shipping lines and rely on `cart.total` directly, while keeping existing behavior for physical shipments.

**What's the end goal architecture or state?**
Checkout totals logic uses an `isDigitalOnlyCart` helper (or equivalent) to branch behavior. For digital-only carts, it hides shipping-related lines and uses `cart.total` directly. For non-digital carts, it preserves the current shipping and estimated-shipping behavior.

**In-scope (must-have):**
- Parity with the sibling project’s digital-only shipping display behavior for the main checkout order summary.
- Conditional rendering of Shipping/Estimated Shipping lines based on whether the cart is digital-only or not.
- Ensuring the Total for digital-only carts is based on `cart.total` without adding estimated shipping.

**Out-of-scope (won't-have):**
- Broader redesign of the checkout page or layout.
- Changes to payment methods or underlying Medusa cart calculation logic.

**Nice-to-have (could be deferred):**
- Additional analytics or logging around digital-only checkout flows.
- Copy refinements or microcopy testing around digital events.

---

### Technical Constraints & Requirements

**Platform/technical constraints:**
- Must align with existing Medusa v2 cart totals and checkout architecture in this repo.
- Implementation should reuse or closely mirror the existing `isDigitalOnlyCart` logic from the sibling project where feasible.

**Quality bars:**
- Behavior must be fully covered in unit/integration/e2e tests for digital-only carts and non-digital carts.

---

### Dependencies & Blockers

**Technical dependencies:**
- Access to the sibling project implementation for reference and potential shared helpers.

**Risks:**
- Future support for mixed carts (digital + physical) should not be blocked by this change.

---

### Implementation Approach

**Implementation strategy:**
- Update the checkout order summary totals component to use `isDigitalOnlyCart(cart, shippingOptions)` (or a ported equivalent) to decide whether to hide shipping lines and how to compute the Total value.

---

### Acceptance Criteria & Verification

**How will we verify this works?**
- Digital-only cart (event tickets only) shows Subtotal, optional Discount, Taxes, and Total; Shipping/Estimated Shipping lines are not rendered; Total equals `cart.total`.
- Non-digital cart with a chosen shipping method shows a Shipping line using `cart.shipping_total`; Total matches cart totals including shipping.
- Non-digital cart without a chosen shipping method shows an Estimated Shipping line based on available options; Total includes the appropriate estimated shipping.

---

## Assumptions Log

| Assumption | Owner | Validation Required | Validation Method | Due Date | Status |
| --- | --- | --- | --- | --- | --- |
| Mixed carts (digital + physical) are not in scope right now but are a likely future requirement; implementation should avoid blocking support for them. | Pablo | Yes | Confirm future roadmap and verify that branching logic can accommodate mixed carts later. | 2026-04-01 | Pending |

---

## Clarification Session Log

### Session 1: 2026-03-17
**Participants:** Pablo

**Questions Asked:**
1. Who is the primary decision-maker on whether the checkout behavior looks correct? → 1. A (Pablo is the main product/UX decision-maker for this flow.)
2. How strictly should we mirror the sibling project’s digital-only behavior? → 2. A (Exact parity: same logic and display rules; any differences are bugs.)
3. Do you anticipate any mixed carts (digital tickets + physical items) now or in the near future that this change must handle? → 3. C (Mixed carts are a likely future requirement; design should avoid blocking that scenario.)

**Unresolved Items:**
- Confirm whether any other stakeholders (e.g., designer or client) need to review the final behavior in this storefront. (Status: ❓ unknown)

---

## Next Steps

### Spec Readiness Assessment
**Status:** ⬜ Ready for Spec | ⬜ Research Needed | ✅ More Clarification Needed

**Rationale:**
We have alignment on decision-maker, parity requirements with the sibling project, and high-level expectations around mixed carts, but still need a bit more specificity about edge cases and testing expectations before this is fully spec-ready.

