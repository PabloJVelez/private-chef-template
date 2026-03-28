# Clarified Requirement Packet — Event Tickets Fulfillment and Admin Shipping Status

- **Requestor:** PabloJVelez (template owner / developer) `[INFERRED]`
- **Decision Maker:** PabloJVelez — **confirmed** via clarification answers (2026-03-28)
- **Date:** 2026-03-28
- **Mode:** Task Clarification
- **Status:** Complete
- **Related Task Hub:** `.devagent/workspace/tasks/active/2026-03-28_event-tickets-fulfillment-and-shipping-admin/`
- **Related Research:** `../research/2026-03-28_event-tickets-fulfillment-shipping-research.md`

## Inferred task concept (updated after clarification)

Align **Medusa admin and order state** with **digital event tickets**: (1) correct data so lines do not show **Requires shipping** falsely; (2) **automatically fulfill** ticket lines when payment is **captured**; (3) if payment is still not captured after the event, run a **scheduled job ~24 hours after the event date** to **auto-capture**, which then triggers the same fulfillment path as normal capture; (4) for **mixed carts**, auto-fulfill **only** ticket lines and leave physical lines to normal shipping fulfillment.

## Assumptions (`[INFERRED]` unless cited from stakeholder answers)

- Tickets are created via `accept-chef-event` with `EVENT-*` SKUs and `ChefEvent.productId` / `requestedDate` available for automation.
- Admin is stock Medusa Dashboard; fulfillment UX follows core `order.items[].requires_shipping` behavior.
- Auto-capture for authorized-but-uncaptured payments is **technically supported** by the active payment provider (e.g. Stripe) for relevant orders — **validate in implementation plan** (`🔍`).

---

## Task overview

### Context

- **Task name/slug:** `event-tickets-fulfillment-and-shipping-admin`
- **Business context:** Admin shows **Not fulfilled** and **Requires shipping** for digital tickets; ops want lifecycle automation aligned with capture and event timing.
- **Stakeholders:** PabloJVelez (owner, decision maker)
- **Prior work:** Research packet documents root cause for **Requires shipping** (Medusa default inventory + SKU reuse in `accept-chef-event`).

### Clarification sessions

- **Session 1 (2026-03-28):** Async `devagent clarify-task`; Q1–Q3 answered by PabloJVelez (chat).

---

## Clarified requirements

### Scope & end goal

**What needs to be done?**

1. **Inventory / line items:** Ensure ticket variants’ linked inventory has `requires_shipping: false` (fix `accept-chef-event` + backfill existing `EVENT-*` data as needed).
2. **On payment captured:** Automatically create Medusa fulfillments for **eligible ticket line items** so admin shows progress toward **Fulfilled** without manual **Fulfill items** for those lines.
3. **Post-event, not yet captured:** A **cron / scheduled job** runs approximately **24 hours after the event date**; for orders that still need capture, perform **auto-capture** so that the normal post-capture flow runs (including auto-fulfillment from (2)).
4. **Mixed carts:** Apply (2) and (3) only to **ticket** lines (`EVENT-*` / agreed identifier); **physical** lines keep standard shipping fulfillment behavior.

**End state**

- New ticket orders: no false **Requires shipping** on ticket lines.
- Captured ticket orders: ticket lines fulfilled automatically.
- Authorized-but-uncaptured orders past event + ~24h: capture attempted by job; fulfillment follows capture success path.
- Mixed orders: tickets auto-handled per above; physical items unchanged by ticket automation.

**In-scope (must-have)**

- Forward fix in `accept-chef-event` for `requires_shipping`.
- Subscriber or workflow hook: **on capture** → fulfill ticket lines (and only those lines on mixed orders).
- Scheduled job: **~24h after event date** → find relevant unpaid/uncaptured ticket orders → **capture** payment.
- Handling for mixed carts (ticket vs non-ticket line discrimination).

**Out-of-scope**

- Forking `@medusajs/dashboard` unless explicitly added later.

**Nice-to-have**

- Admin script or one-off to repair historical inventory/orders.

---

### Technical constraints & requirements

- **Stack:** Medusa v2, `chef-event` module, `accept-chef-event`, Stripe Connect / payment module as configured in repo.
- **Research locked:** `order.items[].requires_shipping` ← linked inventory item; core default `requires_shipping: true` on auto-created inventory; current workflow reuses by SKU without updating flag.

**New planning spikes (`🔍` in create-plan)**

- Exact Medusa workflows/events for “payment captured” and “create fulfillment” for non-shipping lines.
- Stripe (Connect) rules: capturing authorized payments after delay, idempotency, failures, partial authorization.
- **Time anchor for “24 hours after the date of the event”:** interpret against `ChefEvent.requestedDate` storage (UTC vs local) — document chosen rule in plan (`[NEEDS CLARIFICATION: timezone]` until plan locks).

---

### Dependencies & blockers

- Payment provider must allow programmatic capture for target payment sessions.
- Job runner available in Medusa (scheduled API / module) — confirm in plan.

---

### Implementation approach

- Fix inventory on create/reuse in `accept-chef-event`; migration for existing items.
- **Capture path:** subscriber on capture success → fulfill lines where SKU matches `EVENT-*` (or inventory `requires_shipping === false` + product link to chef event — plan picks single rule).
- **Cron path:** query orders / payments linked to chef events where `requestedDate + 24h <= now` and capture not yet done → invoke capture; failures logged / alert (plan defines retry and dead-letter behavior).

---

### Acceptance criteria & verification

- [ ] New accepted chef event → ticket line items expose `requires_shipping: false` (Admin API or UI).
- [ ] Ticket-only order: on capture, ticket lines reach fulfilled quantity without manual fulfillment.
- [ ] Order with ticket + physical lines: only ticket lines auto-fulfill on capture; physical lines still need normal flow.
- [ ] Simulated or test order: authorized, not captured, event date + job window → job attempts capture; on success, fulfillment runs as after immediate capture.
- [ ] Documented behavior when capture fails (decline, expired authorization) after job run.

---

## Question tracker

| ID | Topic | Question (summary) | Status |
| --- | --- | --- | --- |
| Q1 | Auto-fulfill on capture | Auto-create Medusa fulfillments on capture? | ✅ answered — **Yes (A)** |
| Q2 | Post-event without capture | How to handle if not captured after event? | ✅ answered — **Auto-capture via cron ~24h after event date; fulfillment via capture path** |
| Q3 | Mixed carts | Auto-fulfill only tickets or all manual? | ✅ answered — **Auto-fulfill ticket lines only (A)** |
| Q4 | Event + 24h timezone | Anchor “event date” and +24h in which TZ? | 🔍 needs research / lock in **create-plan** |
| Q5 | Backfill | Repair existing `EVENT-*` inventory? | ⏭️ deferred — recommend **yes** in plan as migration task |

---

## Assumptions log

| Assumption | Owner | Validation required | Method |
| --- | --- | --- | --- |
| Decision maker is PabloJVelez | Pablo | No | Confirmed in session |
| Fulfillment means real Medusa fulfillments | Pablo | No | Q1 = A |
| Post-event path = auto-capture then same flow as capture | Pablo | No | Stated in session |
| Auto-capture is allowed/feasible for Connect + Medusa | Eng | Yes | Spike in create-plan / Stripe docs |
| `ChefEvent.requestedDate` defines “event date” for cron | Eng | Yes | Align with plan (Q4) |

---

## Gaps requiring research (hand to `devagent create-plan` / spike)

- Medusa event names and fulfillment workflows for digital lines.
- Stripe Connect capture after event + failure modes.
- Timezone rule for `requestedDate + 24h`.

---

## Clarification session log

| When | Question | Answer | Stakeholder |
| --- | --- | --- | --- |
| 2026-03-28 | — | Session opened; packet created | — |
| 2026-03-28 | Q1 Auto-fulfill on capture? | **A** — auto-create fulfillments on capture | PabloJVelez |
| 2026-03-28 | Q2 Post-event, not captured? | If capture has not happened after event date, **auto-capture**; **cron ~24h after event date**; that triggers fulfillment | PabloJVelez |
| 2026-03-28 | Q3 Mixed carts? | **A** — auto-fulfill **only** ticket lines; physical lines normal | PabloJVelez |

---

## Next steps

- **Plan readiness:** **Ready** for `devagent create-plan` (minor technical locks: Q4/Q5 in plan).
- Run `devagent create-plan` with this packet + research packet.

---

## Change log

| Date | Change |
| --- | --- |
| 2026-03-28 | Initial packet from inferred context + research |
| 2026-03-28 | Q1–Q3 answered; status Complete; post-event flow = scheduled auto-capture + capture-driven fulfillment |
