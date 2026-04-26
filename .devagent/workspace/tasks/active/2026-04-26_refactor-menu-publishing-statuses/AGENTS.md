# Refactor Menu Publishing Statuses Progress Tracker

- Owner: PabloJVelez
- Last Updated: 2026-04-26
- Status: Draft
- Task Hub: `.devagent/workspace/tasks/active/2026-04-26_refactor-menu-publishing-statuses/`

## Summary
Refactor how menus are exposed on the storefront so they no longer auto-publish immediately on creation. Menus will use a custom lifecycle (`draft`, `active`, `inactive`) with status stored as a non-enum string, default new menus to `draft`, backfill existing visible menus to `active`, expose only `active` menus on store routes, and add an admin ability to duplicate menus.

## Agent Update Instructions
- Always update "Last Updated" to today's date (ISO: YYYY-MM-DD) when editing this file. **Get the current date by explicitly running `date +%Y-%m-%d` first, then use the output for the "Last Updated" field.**
- Progress Log: Append a new entry at the end in the form `- [YYYY-MM-DD] Event: concise update, links to files`. Do not rewrite or delete prior entries. **Use the date retrieved from `date +%Y-%m-%d` for the date portion.**
- Implementation Checklist: Mark items as `[x]` when complete, `[~]` for partial with a short note. Add new items if discovered; avoid removing items—strike through only when obsolete.
- Key Decisions: Record important decisions as `- [YYYY-MM-DD] Decision: rationale, links`. **Use the date retrieved from `date +%Y-%m-%d` for the date portion.**
- References: Keep links current to latest spec, research, and tasks. Add additional references as they are created.
- Scope: Edits here should reflect coordination/progress only; do not include application code changes. Preserve history.

## Key Decisions
- [2026-04-26] Decision: Use custom menu statuses (`draft`, `active`, `inactive`) instead of Medusa product status parity. Source: `.devagent/workspace/tasks/active/2026-04-26_refactor-menu-publishing-statuses/clarification/2026-04-26_initial-clarification.md`.
- [2026-04-26] Decision: Storefront must expose only `active` menus; unknown/future statuses are hidden by default. Source: `.devagent/workspace/tasks/active/2026-04-26_refactor-menu-publishing-statuses/clarification/2026-04-26_initial-clarification.md`.
- [2026-04-26] Decision: Status remains non-enum at persistence layer; admin API validates current allowlist `draft|active|inactive`. Source: `.devagent/workspace/tasks/active/2026-04-26_refactor-menu-publishing-statuses/clarification/2026-04-26_initial-clarification.md`.
- [2026-04-26] Decision: Include menu duplication capability in this task scope; duplicated menus should be created as `draft`. Source: user directive in active session + implementation plan update.

## Progress Log
- [2026-04-26] Event: Created research packet documenting current menu visibility behavior and status introduction touchpoints. `.devagent/workspace/tasks/active/2026-04-26_refactor-menu-publishing-statuses/research/2026-04-26_menu-status-parity-research.md`.
- [2026-04-26] Event: Completed interactive clarification; finalized lifecycle decisions, migration policy, and API/store constraints. `.devagent/workspace/tasks/active/2026-04-26_refactor-menu-publishing-statuses/clarification/2026-04-26_initial-clarification.md`.
- [2026-04-26] Event: Created implementation plan with execution tasks, acceptance criteria, and risk mapping. `.devagent/workspace/tasks/active/2026-04-26_refactor-menu-publishing-statuses/plan/2026-04-26_menu-status-lifecycle-implementation-plan.md`.
- [2026-04-26] Event: Expanded scope to include menu duplication and updated implementation plan tasks/risks accordingly. `.devagent/workspace/tasks/active/2026-04-26_refactor-menu-publishing-statuses/plan/2026-04-26_menu-status-lifecycle-implementation-plan.md`.

## Implementation Checklist
- [x] Define exact menu lifecycle and affected transitions (`draft`, `active`, `inactive`), including default/backfill behavior.
- [x] Identify backend and storefront touchpoints where menu visibility currently depends on auto-publish behavior.
- [ ] Implement status-driven menu publication flow and validate active-only storefront visibility plus admin allowlist enforcement.
- [ ] Implement menu duplication flow (API + workflow/service) that creates draft duplicates with expected nested content.

## Open Questions
- None blocking for planning. Future enhancement: configurable status catalog beyond `draft|active|inactive`.
- Duplication naming/content-copy conventions should be finalized during implementation (e.g., title suffix and metadata handling).

## References
- `.devagent/workspace/product/mission.md` — Mission emphasizes reusable template patterns and scalable client delivery. (freshness: 2026-04-26)
- `.devagent/workspace/product/roadmap.md` — Horizon goals highlight richer shared features including menu-related capabilities. (freshness: 2026-04-26)
- `.devagent/workspace/product/guiding-questions.md` — Captures open threads around templatized values and repeatable onboarding patterns. (freshness: 2026-04-26)
- `.devagent/workspace/memory/constitution.md` — Reinforces mission-traceable and standards-aligned execution for task planning and implementation. (freshness: 2026-04-26)
- `.devagent/workspace/memory/decision-journal.md` — Records strategic direction for evolving this repository as a reusable client template. (freshness: 2026-04-26)
- `.devagent/workspace/tasks/active/2026-04-26_refactor-menu-publishing-statuses/research/2026-04-26_menu-status-parity-research.md` — Baseline investigation of current menu routes/model/workflows and status gating implications. (freshness: 2026-04-26)
- `.devagent/workspace/tasks/active/2026-04-26_refactor-menu-publishing-statuses/clarification/2026-04-26_initial-clarification.md` — Final stakeholder decisions for lifecycle, defaults, backfill, and validation guardrails. (freshness: 2026-04-26)
- `.devagent/workspace/tasks/active/2026-04-26_refactor-menu-publishing-statuses/plan/2026-04-26_menu-status-lifecycle-implementation-plan.md` — Execution-ready implementation plan. (freshness: 2026-04-26)

## Next Steps
- `devagent review-plan`
- Execute tasks directly from the Implementation Plan section in `.devagent/workspace/tasks/active/2026-04-26_refactor-menu-publishing-statuses/plan/2026-04-26_menu-status-lifecycle-implementation-plan.md`
