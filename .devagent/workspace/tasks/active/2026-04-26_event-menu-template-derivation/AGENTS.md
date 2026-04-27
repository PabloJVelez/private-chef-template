# Event Menu Template Derivation Progress Tracker

- Owner: PabloJVelez
- Last Updated: 2026-04-26
- Status: Draft
- Task Hub: `.devagent/workspace/tasks/active/2026-04-26_event-menu-template-derivation/`

## Summary
This task implements a new event-specific menu editing flow so chef events can start from a linked template menu but safely diverge without mutating the original template. Today, menus can be auto-published and linked to chef events either through storefront request creation or when chefs create events directly in admin; the requested behavior is to let chefs open an event, edit the associated menu for that event's needs, and persist those edits as a new draft menu. Template menus must remain unchanged unless explicitly edited from the admin menus page, preserving template integrity while enabling per-event customization.

## Agent Update Instructions
- Always update "Last Updated" to today's date (ISO: YYYY-MM-DD) when editing this file. **Get the current date by explicitly running `date +%Y-%m-%d` first, then use the output for the "Last Updated" field.**
- Progress Log: Append a new entry at the end in the form `- [YYYY-MM-DD] Event: concise update, links to files`. Do not rewrite or delete prior entries. **Use the date retrieved from `date +%Y-%m-%d` for the date portion.**
- Implementation Checklist: Mark items as `[x]` when complete, `[~]` for partial with a short note. Add new items if discovered; avoid removing items—strike through only when obsolete.
- Key Decisions: Record important decisions as `- [YYYY-MM-DD] Decision: rationale, links`. **Use the date retrieved from `date +%Y-%m-%d` for the date portion.**
- References: Keep links current to latest spec, research, and tasks. Add additional references as they are created.
- Scope: Edits here should reflect coordination/progress only; do not include application code changes. Preserve history.

## Key Decisions
- [Date] Decision: Description, rationale, links to supporting docs.
- [2026-04-26] Decision: Clarification confirmed that event menu derivation must lock template reference, copy pricing rows at derivation, and keep default draft/non-storefront-visible status behavior; this task is now ready for plan creation.

## Progress Log
- [2026-04-26] Event: Task hub scaffolded from `/new-task` command and initial objective captured in Summary.
- [2026-04-26] Event: Completed research workflow and produced implementation-design packet at `.devagent/workspace/tasks/active/2026-04-26_event-menu-template-derivation/research/2026-04-26_event-menu-template-derivation-research.md`.
- [2026-04-26] Event: Completed clarification workflow and finalized requirements packet at `.devagent/workspace/tasks/active/2026-04-26_event-menu-template-derivation/clarification/2026-04-26_initial-clarification.md`; marked ready for `devagent create-plan`.
- [2026-04-26] Event: Completed create-plan workflow and generated implementation plan at `.devagent/workspace/tasks/active/2026-04-26_event-menu-template-derivation/plan/2026-04-26_event-menu-template-derivation-implementation-plan.md`.
- [2026-04-26] Event: Implemented event-menu derivation flow (model field + migration, derive workflow/API, admin SDK/hooks/UI wiring, template lock enforcement) across `apps/medusa/src/modules/chef-event/**`, `apps/medusa/src/workflows/**`, `apps/medusa/src/api/admin/chef-events/**`, `apps/medusa/src/admin/routes/chef-events/**`, and `apps/medusa/src/sdk/admin/admin-chef-events.ts`; validation run: `yarn typecheck` (apps/medusa) passed, root `yarn lint` reported no lint tasks configured.
(Append new entries here, preserving historical entries to maintain a progress timeline.)

## Implementation Checklist
- [x] Build event-level menu edit flow that creates a draft derivative rather than mutating template menus.
- [x] Ensure template menu edits remain restricted to admin menus page editing flow.
- [~] Validate publish/draft behavior after menu derivation to avoid unintended storefront publication. (Behavior enforced by existing draft-default lifecycle and derivation flow; dedicated automated regression tests are still pending.)

## Open Questions
- Question: Add dedicated automated regression coverage for derivation idempotency + draft visibility before final sign-off.

## References
- Product mission: `.devagent/workspace/product/mission.md` (freshness: 2026-04-26) — Defines this repo as a reusable private-chef template where client-specific customizations are expected.
- Product roadmap: `.devagent/workspace/product/roadmap.md` (freshness: 2026-04-26) — Calls out shared menu/booking feature growth and template evolution across chefs.
- Constitution C1/C2: `.devagent/workspace/memory/constitution.md` (freshness: 2026-04-26) — Requires mission-traceable changes and quality guardrails for implementation workflows.
- Strategic decision log: `.devagent/workspace/memory/decision-journal.md` (freshness: 2026-04-26) — Records the template-first delivery model and constraints for reusable features.
- Research packet: `.devagent/workspace/tasks/active/2026-04-26_event-menu-template-derivation/research/2026-04-26_event-menu-template-derivation-research.md` (freshness: 2026-04-26) — Documents current state, tradeoffs, and recommended event-menu derivation architecture.
- Clarification packet: `.devagent/workspace/tasks/active/2026-04-26_event-menu-template-derivation/clarification/2026-04-26_initial-clarification.md` (freshness: 2026-04-26) — Captures validated scope decisions and plan-readiness confirmations.
- Plan document: `.devagent/workspace/tasks/active/2026-04-26_event-menu-template-derivation/plan/2026-04-26_event-menu-template-derivation-implementation-plan.md` (freshness: 2026-04-26) — Defines execution tasks, acceptance criteria, risks, and validation strategy.

## Next Steps
- Execute tasks from the Implementation Plan section in `.devagent/workspace/tasks/active/2026-04-26_event-menu-template-derivation/plan/2026-04-26_event-menu-template-derivation-implementation-plan.md`
- `devagent implement-plan`
