# Receipt to Host and Email Refactor — Progress Tracker

- Owner: PabloJVelez
- Last Updated: 2026-03-23
- Status: Draft
- Task Hub: `.devagent/workspace/tasks/active/2026-03-23_chef-receipt-to-host-and-email-refactor/`

## Summary

We need to do two things in this codebase: **support sending receipts** (including the “receipt to host” behavior where applicable), and **refactor the current transactional emails** so they match the improved patterns used elsewhere. The same work was already implemented in the sibling project **sdoa**; this task is to port and adapt that approach here using the sibling task artifacts as the primary reference (implementation plan, task hub notes, and initial clarification). Downstream work should compare this repo’s Medusa/Resend/email modules and order/payment flows to **sdoa**, then produce research and a plan before any application changes.

## Agent Update Instructions

- Always update "Last Updated" to today's date (ISO: YYYY-MM-DD) when editing this file. **Get the current date by explicitly running `date +%Y-%m-%d` first, then use the output for the "Last Updated" field.**
- Progress Log: Append a new entry at the end in the form `- [YYYY-MM-DD] Event: concise update, links to files`. Do not rewrite or delete prior entries. **Use the date retrieved from `date +%Y-%m-%d` for the date portion.**
- Implementation Checklist: Mark items as `[x]` when complete, `[~]` for partial with a short note. Add new items if discovered; avoid removing items—strike through only when obsolete.
- Key Decisions: Record important decisions as `- [YYYY-MM-DD] Decision: rationale, links`. **Use the date retrieved from `date +%Y-%m-%d` for the date portion.**
- References: Keep links current to latest spec, research, and tasks. Add additional references as they are created.
- Scope: Edits here should reflect coordination/progress only; do not include application code changes. Preserve history.

## Key Decisions

- [2026-03-23] Decision (clarify-task): **Full parity** with reference feature set—receipt-to-host (optional tip) **then** refactor the five event-flow emails to receipt-style. **Out-of-scope** unchanged from reference: no receipt ID/numbering product, no tip analytics dashboard, no payment-reminder in this task. **Decision maker:** PabloJVelez. **Email constraint:** Customer-facing transactional copy must **not** mention the sibling project or internal codenames; use this product’s branding/copy only. Link: `clarification/2026-03-23_initial-clarification.md`.
- [2026-03-23] Decision (create-plan): Execute **Phase A** (A1 tip+migration+DTOs, A2 GET+`availableTickets`, A3 workflow+subscriber+template+Resend, A4 API+SDK+hook, A5 admin UI) then **Phase B** (B1 shared layout, B2 refactor five emails). Inventory: five templates present, no receipt; `service.ts` has no `RECEIPT`; chef-event has no tip fields; GET `[id]` has no `availableTickets`. Link: `plan/2026-03-23_chef-receipt-and-email-refactor-implementation-plan.md`.

## Progress Log

- [2026-03-23] Event: Task hub created via `devagent new-task`. Scope: receipt sending + email refactor, sibling **sdoa** task `2026-02-23_chef-receipt-to-host-and-email-refactor` as reference; research/plan/implementation to follow.
- [2026-03-23] Event: **Clarification complete** (`clarification/2026-03-23_initial-clarification.md`). Confirmed Q1–A (full parity + **no sibling naming in customer-facing emails**), Q2–A (same out-of-scope as reference), Q3–A (PabloJVelez decider). Next: `devagent research` → `devagent create-plan`.
- [2026-03-23] Event: **Implementation plan created** — `plan/2026-03-23_chef-receipt-and-email-refactor-implementation-plan.md` (Phase A receipt pipeline A1–A5, Phase B shared layout B1 + five-template refactor B2; repo inventory inlined). Next: review plan → `devagent implement-plan` or explicit implementation.
- [2026-03-23] Event: **implement-plan executed** — Phase A: `tipAmount`/`tipMethod` on chef event + `Migration20260323120000`, SDK DTOs, `getAvailableTicketsForProduct` + GET `admin/chef-events/[id]`, `send-receipt` workflow, `chef-event-receipt` subscriber, `receipt.tsx` + Resend `RECEIPT`, POST `send-receipt`, SDK `sendReceipt` + `useAdminSendReceiptMutation`, admin detail **Send Receipt** modal (duplicate-send confirm, tip fields). Phase B: `transactional-email-layout` + styles + `receipt-layout` re-export; refactored five event/order templates to shared layout. **Follow-up:** run `yarn migrate` (or `medusa db:migrate`) in `apps/medusa`; manual QA receipt send + `yarn dev:email` previews.

## Implementation Checklist

- [~] Research: Repo inventory and gaps captured **in** the implementation plan (2026-03-23); optional follow-up diff vs sibling codebase if implementer needs it.
- [x] Plan: `plan/2026-03-23_chef-receipt-and-email-refactor-implementation-plan.md` (Phase A/B tasks A1–A5, B1–B2).
- [x] Implement: Receipt pipeline + shared transactional layout + five template refactors (see Progress Log).
- [ ] Verify: Run DB migration; manual receipt send + React Email preview for all templates; spot-check order-placed and resend flows.

## Open Questions

- (None blocking clarification — eligibility/trigger details to confirm vs this repo during `devagent research`.)

## References

- `[TEMPLATE MISSING]` Core task template `.devagent/core/templates/task-agents-template.md` was not found at scaffold time; this hub follows the structure used by other active tasks.
- [2026-03-23] `.devagent/AGENTS.md` — workflow roster and standard instructions (date handling, storage patterns).
- [2026-03-23] `.devagent/workflows/new-task.md` — scaffolding workflow used to create this hub.
- [2026-03-23] `.devagent/workspace/product/` — searched for receipt/email/Resend terms; no matches (freshness: 2026-03-23).
- [2026-03-23] `.devagent/workspace/memory/` — searched for receipt/email/Resend terms; no matches (freshness: 2026-03-23).
- [2026-03-23] `clarification/2026-03-23_initial-clarification.md` — **Complete**; scope, out-of-scope, copy/branding constraint (no sibling names in emails), governance.
- [2026-03-23] `plan/2026-03-23_chef-receipt-and-email-refactor-implementation-plan.md` — Draft implementation plan (product context + tasks A1–A5, B1–B2).
- [2026-03-23] Sibling completed task (engineering reference only, outside this repo): `/Users/pablo/Personal/development/sdoa/sdoa/.devagent/workspace/tasks/completed/2026-02-23_chef-receipt-to-host-and-email-refactor/` — `AGENTS.md`, `clarification/2026-02-23_initial-clarification.md`, `plan/2026-02-23_chef-receipt-and-email-refactor-implementation-plan.md`.

## Next Steps

- From `apps/medusa`: **`yarn migrate`** (or `medusa db:migrate`) to apply `Migration20260323120000`.
- **`yarn dev:email`** — confirm `receipt` + five refactored templates in preview.
- Send a test receipt from admin (confirmed event, `productId`, date passed or `availableTickets === 0`).
- When satisfied: **`devagent mark-task-complete`** (optional).
