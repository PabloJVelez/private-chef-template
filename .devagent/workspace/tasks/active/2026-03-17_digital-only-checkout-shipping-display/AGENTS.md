# Digital-Only Checkout Shipping Display Progress Tracker

- Owner: PabloJVelez
- Last Updated: 2026-03-17
- Status: Draft
- Task Hub: `.devagent/workspace/tasks/active/2026-03-17_digital-only-checkout-shipping-display/`

## Summary
This task ensures that the storefront checkout correctly handles digital-only carts (such as event tickets delivered digitally) by hiding shipping-related lines and relying on `cart.total` directly when no physical shipments are involved. The current checkout shows a `Shipping` (or `Estimated Shipping`) line even when the cart only contains digital items, which is misleading for customers buying digital event tickets. We already have a working implementation of the desired behavior in a sibling project; this task tracks porting those changes into this project so that digital-only carts omit shipping lines, while non-digital carts preserve existing shipping and estimated shipping behavior.

## Key Decisions
- [2026-03-17] Decision: Track this work as a dedicated task hub focused on aligning checkout totals and shipping display behavior for digital-only carts with an existing sibling implementation.

## Progress Log
- [2026-03-17] Event: Created task hub and initial AGENTS.md for digital-only checkout shipping display behavior; ready for research and planning workflows.

## Implementation Checklist
- [ ] Review the sibling project implementation of digital-only cart shipping display behavior and identify relevant helpers (e.g., `isDigitalOnlyCart`) and total calculation patterns.
- [ ] Locate this project's checkout order summary totals component (e.g., `CheckoutOrderSummaryTotals.tsx`) and confirm existing behavior for shipping and estimated shipping lines.
- [ ] Design and document the exact behavior for digital-only vs non-digital carts, ensuring parity with the sibling project and compatibility with Medusa cart totals.
- [ ] Implement the updated totals calculation and conditional rendering in the checkout order summary component, reusing shared helpers where possible.
- [ ] Add or update tests (unit/integration/e2e) to cover digital-only carts, mixed carts, and physical-only carts for checkout totals and shipping display.
- [ ] Verify the UI manually for example digital-only carts (event tickets) to confirm that shipping lines are hidden and totals are correct.

## Open Questions
- Are there any mixed carts in this storefront (digital + physical) that require special handling beyond the sibling project behavior?
- Do we need additional analytics or logging around digital-only checkout flows to monitor adoption and potential issues?

## References
- [2026-03-17] `.devagent/workflows/new-task.md` — Workflow definition for scaffolding task hubs and metadata.
- [2026-03-17] `.devagent/AGENTS.md` — Project-level workflow roster and standard instructions.

