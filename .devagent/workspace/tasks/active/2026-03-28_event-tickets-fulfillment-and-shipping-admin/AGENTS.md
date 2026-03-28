# Event Tickets Fulfillment and Admin Shipping Status Progress Tracker

- Owner: PabloJVelez
- Last Updated: 2026-03-28
- Status: Draft
- Task Hub: `.devagent/workspace/tasks/active/2026-03-28_event-tickets-fulfillment-and-shipping-admin/`

## Summary
This task covers **event ticket** orders in Medusa admin and backend behavior. The product owner wants two outcomes:

1. **Fulfillment semantics:** Treat these orders as **fulfilled** when **either** payment has been **captured** **or** the **event date has passed** (so admin and operational views align with digital event tickets rather than physical shipment workflows).

2. **Shipping requirement in admin:** Event tickets incorrectly show **“Requires shipping”** / fulfillment UI that implies physical shipment even when shipping total is zero. We need to determine **why** Medusa (or our data model) marks these line items as requiring shipping and correct it so admin reflects **non-shippable** digital tickets.

The full intent from intake: *“Since these are event tickets, we should consider the order fulfilled under two conditions: the payment was captured or the event date has passed. Also, we should not have a ‘Required shipping’ status on these—we need to look into why the admin is reflecting this falsely.”*

## Agent Update Instructions
- Always update "Last Updated" to today's date (ISO: YYYY-MM-DD) when editing this file. **Get the current date by explicitly running `date +%Y-%m-%d` first, then use the output for the "Last Updated" field.**
- Progress Log: Append a new entry at the end in the form `- [YYYY-MM-DD] Event: concise update, links to files`. Do not rewrite or delete prior entries. **Use the date retrieved from `date +%Y-%m-%d` for the date portion.**
- Implementation Checklist: Mark items as `[x]` when complete, `[~]` for partial with a short note. Add new items if discovered; avoid removing items—strike through only when obsolete.
- Key Decisions: Record important decisions as `- [YYYY-MM-DD] Decision: rationale, links`. **Use the date retrieved from `date +%Y-%m-%d` for the date portion.**
- References: Keep links current to latest spec, research, and tasks. Add additional references as they are created.
- Scope: Edits here should reflect coordination/progress only; do not include application code changes. Preserve history.

## Key Decisions
- [2026-03-28] Decision: Track fulfillment logic and admin shipping display as one task hub because both concern event-ticket order representation in Medusa (fulfillment sets, payment state, and event scheduling).
- [2026-03-28] Decision (PabloJVelez): On payment **capture**, **auto-fulfill** ticket lines in Medusa (no manual fulfill for those lines). If still **not captured** after the event, a **scheduled job ~24h after event date** runs **auto-capture**, which triggers the same fulfillment path. **Mixed carts:** auto-fulfill **only** ticket lines; physical lines use normal shipping fulfillment.

## Progress Log
- [2026-03-28] Event: Task hub scaffolded via `devagent new-task`; ready for clarification, research, and planning.
- [2026-03-28] Event: Research packet added — root cause for admin **Requires shipping** (Medusa default inventory `requires_shipping: true` + SKU reuse in `accept-chef-event`); see `research/2026-03-28_event-tickets-fulfillment-shipping-research.md`.
- [2026-03-28] Event: Clarification session 1 started — `clarification/2026-03-28_initial-clarification.md` (in progress); awaiting Q1–Q3 on auto-fulfill, post-event without capture, and mixed carts.
- [2026-03-28] Event: Clarification **complete** — auto-fulfill on capture; post-event **cron ~24h after event date** to **auto-capture** then fulfillment; mixed carts = ticket lines only. See `clarification/2026-03-28_initial-clarification.md`.

## Implementation Checklist
- [x] Clarify fulfillment semantics — **real Medusa fulfillments** on capture; post-event via **cron ~24h after event date** → **auto-capture** → same fulfillment path; mixed carts = **ticket lines only** (`clarification/2026-03-28_initial-clarification.md`).
- [x] Event date source for automation — **`ChefEvent.requestedDate`** (see clarification); **timezone +24h anchor** still to lock in plan.
- [~] Trace Medusa fields driving **Requires shipping** / fulfillment requirements for Event Ticket products (variants, shipping profiles, fulfillment sets, modules). — Research: line item flag comes from linked inventory item; core defaults `requires_shipping: true`; `accept-chef-event` reuses that item by SKU without updating the flag (see research packet).
- [ ] Design backend + admin behavior: payment-captured path, post-event path, and product-level “digital / no shipping” configuration.
- [ ] Implement, add tests, and verify in admin for captured orders and past-event scenarios.

## Open Questions
- **Timezone anchor** for “event date + 24h” vs stored `ChefEvent.requestedDate` — lock in plan.
- **Capture failures** after cron (declined, expired authorization) — retry/notify behavior in plan.
- Canonical **event date** for jobs: prefer **`ChefEvent.requestedDate`** over SKU parsing (already assumed in clarification).

## References
- [2026-03-28] `.devagent/workspace/tasks/active/2026-03-28_event-tickets-fulfillment-and-shipping-admin/research/2026-03-28_event-tickets-fulfillment-shipping-research.md` — Research: admin **Requires shipping**, Medusa inventory defaults, `accept-chef-event` interaction, fulfillment automation gaps.
- [2026-03-28] `.devagent/workspace/tasks/active/2026-03-17_digital-only-checkout-shipping-display/AGENTS.md` — Prior task on digital-only / event ticket cart and checkout shipping display; adjacent problem space.
- [2026-03-28] `.devagent/workspace/product/mission.md` — Product context (private-chef template, Medusa + Remix).
- [2026-03-28] `.devagent/AGENTS.md` — DevAgent workflow roster and standard instructions.
- [2026-03-28] `.devagent/workflows/new-task.md` — Workflow definition for task hub scaffolding.
- [2026-03-28] `apps/medusa/src/workflows/accept-chef-event.ts` — Chef event acceptance workflow (inventory / digital location patterns referenced in prior plans; likely related to ticket products).
- [2026-03-28] `.devagent/workspace/tasks/active/2026-03-28_event-tickets-fulfillment-and-shipping-admin/clarification/2026-03-28_initial-clarification.md` — Requirement clarification (in progress).

## Next Steps
Recommended follow-up (run when ready; do not auto-run):

- `devagent clarify-task` — Lock fulfillment vs. display semantics, event date source, and mixed-cart rules.
- `devagent research` — Map Medusa v2 fulfillment/shipping flags and admin UI to codebase locations.
- `devagent create-plan` — Implementation plan after research.
- `devagent implement-plan` — Execute plan tasks when approved.
