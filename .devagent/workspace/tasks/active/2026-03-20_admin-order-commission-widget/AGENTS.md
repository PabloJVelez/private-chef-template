# Admin Order Commission Visibility Progress Tracker

- Owner: PabloJVelez
- Last Updated: 2026-03-20
- Status: Draft
- Task Hub: `.devagent/workspace/tasks/active/2026-03-20_admin-order-commission-widget/`

## Summary

Add visibility on the **Medusa admin orders** experience so chefs can see **commission collected per order** (how much the platform took). The expectation is that this amount is already available or can be sourced from the **Stripe PaymentIntent** (for example via `application_fee_amount` or related metadata when using Stripe Connect / destination charges). The deliverable is an **admin UI widget** (or equivalent order detail surface) that surfaces that commission figure clearly for each order, aligned with how payments are captured in this template.

## Key Decisions

- [2026-03-20] Decision: Track this work as a dedicated task hub; implementation deferred until research and planning confirm where PaymentIntent data is stored or retrievable for a Medusa order in this codebase.

## Progress Log

- [2026-03-20] Event: Created task hub and initial AGENTS.md for admin order commission visibility; ready for research and planning workflows.
- [2026-03-20] Event: Completed research packet — Stripe Connect fee on PI, provider `data` merge risk, Medusa admin widget zones (`order.details.*`), API `payment_sessions[].data`; see `research/2026-03-20_admin-order-commission-visibility.md`.
- [2026-03-20] Event: Clarification session started — `clarification/2026-03-20_initial-clarification.md` (Q1–Q3 pending stakeholder answers).
- [2026-03-20] Event: Clarification complete — order detail only; provider must persist `application_fee_amount` in v1 (no on-demand Stripe fallback); UI label “Platform commission”. See `clarification/2026-03-20_initial-clarification.md`.
- [2026-03-20] Event: Plan created — 3 tasks: enrich provider lifecycle `data`, create order commission admin widget, verify `AdminOrder` prop depth. See `plan/2026-03-20_admin-order-commission-widget.md`.

## Implementation Checklist

- [ ] Confirm how orders link to payment sessions / captures and where Stripe PaymentIntent IDs or fee fields are persisted (Medusa payment collection, custom module, or provider metadata).
- [ ] Verify what commission data exists on the PaymentIntent today (`application_fee_amount`, metadata, etc.) and whether anything must be added at capture time for reliable admin display.
- [ ] Identify the correct Medusa Admin extension point (order detail widget, custom section, or API + UI) consistent with this repo’s admin setup.
- [ ] Design the widget copy and formatting (currency, cents vs major units, empty/partial states when fee is unavailable).
- [ ] Implement the admin widget and any loader/API needed to read commission per order.
- [ ] Add tests or manual verification steps for orders with and without Connect fees.

## Open Questions

- Is commission always represented by Stripe’s application fee on the PaymentIntent, or are there multiple fee models (tickets vs bento, etc.) that need separate display lines?
- Should historical orders without stored fee data show “—” or trigger a backfill/read from Stripe on demand (with rate limits and permissions)?

## References

- [2026-03-20] `.devagent/workspace/product/mission.md` — Private-chef client template; Medusa + Stripe context for chef-facing admin needs.
- [2026-03-20] `.devagent/workspace/product/roadmap.md` — Foundation includes Stripe integration; admin transparency fits repeatable onboarding.
- [2026-03-20] `.devagent/workspace/tasks/active/2026-03-09_port-stripe-connect-and-admin-onboarding/` — Prior Stripe Connect work and reference provider patterns (`application_fee_amount`, Connect charges).
- [2026-03-20] `.devagent/AGENTS.md` — Workflow roster; research and create-plan live here.
- [2026-03-20] `[TEMPLATE MISSING]` Workflow references `.devagent/core/templates/task-agents-template.md`; this repo uses `.devagent/templates/task-agents-template.md` for similar structure — populated AGENTS.md from established task hub pattern.
- [2026-03-20] `research/2026-03-20_admin-order-commission-visibility.md` — End-to-end findings for commission widget (PaymentIntent fee, persistence, admin zones).

## Next Steps

Recommended follow-up (invoke when ready):

- `devagent research` — Map Medusa admin order UI, payment/order data model, and Stripe Connect fee fields end to end.
- `devagent clarify-task` — If fee semantics or UX (multiple fee types, legacy orders) need stakeholder decisions first.
- `devagent create-plan` — Turn findings into an implementation plan with concrete files and tasks.

Optional: `devagent brainstorm` if multiple UI/UX approaches should be compared before research.
