# Order Commission Widget — Stripe Processing Fees Line

- Owner: PabloJVelez
- Last Updated: 2026-03-28
- Status: Planned (ready for implement)
- Task Hub: `.devagent/workspace/tasks/active/2026-03-28_order-commission-widget-stripe-fees/`

## Summary

Extend the **Medusa admin order payout summary** implemented in `apps/medusa/src/admin/widgets/order-commission-widget.tsx`. The widget already shows **platform commission** and **chef take-home**. The goal is to add a **line item for Stripe processing fees** so the breakdown reconciles (gross → fees → platform commission → chef net, or an equivalent equation that is explicit and correct).

**Business context:** Payments use **Stripe Connect** (connected account). Processing fees are incurred on the **platform** side, but the product intent is to **pass those fees through to the connected account (chef)**—so the admin UI should reflect that fee as something that reduces what the chef ultimately receives (or otherwise makes the numbers add up in a way operators can trust).

## Key Decisions

- [2026-03-28] Clarification (see `clarification/2026-03-28_initial-clarification.md`): v1 shows **estimated** Stripe processing fees only (provider formula); **hide** the row when pass-through is off; label **Stripe processing fees**; platform commission row = **net of** that estimate when pass-through on; persist fee/flag on `payment.data` for admin.

## Progress Log

- [2026-03-28] Event: Task hub scaffolded via `devagent new-task`; ready for clarification, research, and planning.
- [2026-03-28] Event: Research packet — `research/2026-03-28_stripe-processing-fee-line-order-widget.md` (provider gross-up, persistence gaps, Balance Transaction vs estimate, per-line inconsistency).
- [2026-03-28] Event: Clarification session started — `clarification/2026-03-28_initial-clarification.md` (Round 1: fee source, pass-through-off UX, copy).
- [2026-03-28] Event: Clarification complete — Round 1 answers **1A, 2A, 3A**; packet status Complete; ready for `create-plan`.
- [2026-03-28] Event: Plan created — `plan/2026-03-28_order-commission-widget-stripe-fees.md` (4 implementation tasks: util/types, provider persistence + per-line gross-up, medusa-config/env, admin widget).

## Implementation Checklist

- [ ] Confirm where Stripe processing fee amounts can be sourced reliably per order (PaymentIntent/charge/balance transaction, provider `data`, metadata, or post-capture webhook) without violating the “no on-demand Stripe read” preference from the prior commission widget work, or document an explicit exception.
- [ ] Define the exact breakdown labels and math (order of subtraction, currency/smallest-unit handling) so “charged amount”, “Stripe processing fees”, “platform commission”, and “chef take-home” are consistent.
- [ ] Persist or surface fee data in the Stripe Connect payment provider lifecycle if not already available on `payment.data` for admin reads.
- [ ] Update `order-commission-widget.tsx` (and any shared formatting helpers) to render the new line and handle missing/partial fee data.
- [ ] Manually verify orders with Connect payments; note any follow-up for historical backfill.

## Open Questions

- ~~Fee timing / actual vs estimate~~ — **Resolved:** v1 = **estimate** at capture; no async “pending” for actual fees.
- ~~Copy~~ — **Resolved:** neutral **Stripe processing fees**; no “passed through” in the label.
- Do any orders use non–Stripe Connect providers where this line should be hidden? — **Unchanged:** widget already scoped to stripe-connect payment rows only.

## References

- [2026-03-28] `apps/medusa/src/admin/widgets/order-commission-widget.tsx` — Current payout summary widget (platform commission, chef take-home); primary implementation surface.
- [2026-03-28] `.devagent/workspace/tasks/completed/2026-03-20_admin-order-commission-widget/` — Prior task: commission visibility, provider `data` fields (`application_fee_amount`), admin zones, research packet.
- [2026-03-28] `.devagent/workspace/tasks/active/2026-03-09_port-stripe-connect-and-admin-onboarding/` — Stripe Connect port and admin onboarding context.
- [2026-03-28] `.devagent/workspace/product/mission.md` — Client template for private chefs; admin transparency supports repeatable onboarding.
- [2026-03-28] `.devagent/workspace/product/roadmap.md` — Foundation includes Stripe; payout clarity fits Horizon 1–2.
- [2026-03-28] `plan/2026-03-28_order-commission-widget-stripe-fees.md` — Implementation plan (tasks 1–4).
- [2026-03-28] `clarification/2026-03-28_initial-clarification.md` — Requirements (complete).
- [2026-03-28] `research/2026-03-28_stripe-processing-fee-line-order-widget.md` — Fee line options (estimate vs Balance Transaction), `passStripeFeeToChef` behavior, persistence recommendations.
- [2026-03-28] `.devagent/AGENTS.md` — Workflow roster (`research`, `create-plan`, `implement-plan`).
- [2026-03-28] `[TEMPLATE MISSING]` Workflow referenced `.devagent/core/templates/task-agents-template.md`; this hub follows the established completed-task `AGENTS.md` pattern.

## Next Steps

- `devagent implement-plan` or explicit **implement** request — follow `plan/2026-03-28_order-commission-widget-stripe-fees.md` (Tasks 1–4).
