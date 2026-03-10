# Document Templetized Values & Onboarding Runbook Progress Tracker

- Owner: PabloJVelez
- Last Updated: 2026-03-09
- Status: Complete
- Task Hub: `.devagent/workspace/tasks/completed/2026-03-08_document-templatized-values-and-onboarding-runbook/`

## Summary
Document all templatized values (branding, copy, products, config) and where they live in the repo, and design a clear “plug in the chef” runbook so that for any new private-chef client you can reliably swap those values, host a dev demo within 2 weeks of their interest, and have a first mock order placed about a month from initial interest. Add a concrete client onboarding checklist that ties these steps together so the 2-week dev demo and ~1-month first mock order targets are realistic, repeatable, and easy to follow for future you (or collaborators).

## Agent Update Instructions
- Always update "Last Updated" to today's date (ISO: YYYY-MM-DD) when editing this file. **Get the current date by explicitly running `date +%Y-%m-%d` first, then use the output for the "Last Updated" field.**
- Progress Log: Append a new entry at the end in the form `- [YYYY-MM-DD] Event: concise update, links to files`. Do not rewrite or delete prior entries. **Use the date retrieved from `date +%Y-%m-%d` for the date portion.**
- Implementation Checklist: Mark items as `[x]` when complete, `[~]` for partial with a short note. Add new items if discovered; avoid removing items—strike through only when obsolete.
- Key Decisions: Record important decisions as `- [YYYY-MM-DD] Decision: rationale, links`. **Use the date retrieved from `date +%Y-%m-%d` for the date portion.**
- References: Keep links current to latest spec, research, and tasks. Add additional references as they are created.
- Scope: Edits here should reflect coordination/progress only; do not include application code changes. Preserve history.

## Key Decisions
- [2026-03-08] Decision: Create a dedicated task hub to capture all templatized values and a reusable plug-in-the-chef/onboarding flow aligned with the 2-week dev demo and ~1-month first mock order targets.

## Progress Log
- [2026-03-08] Event: Task hub created from `devagent new-task` for documenting templatized values, plug-in-the-chef runbook, and client onboarding checklist.
- [2026-03-08] Event: Clarification session completed; packet at `clarification/2026-03-08_initial-clarification.md`. Ready for `devagent create-plan`.
- [2026-03-09] Event: Research completed; inventory of templatized values and locations at `research/2026-03-09_templatized-values-inventory.md`.
- [2026-03-09] Event: Plan created at `plan/2026-03-09_plug-in-chef-docs-plan.md`. Two implementation tasks: (1) Templatized Values Inventory doc, (2) Combined Playbook (runbook + onboarding checklist).
- [2026-03-09] Event: Task 1 completed — created `docs/templatized-values-inventory.md` (inventory with quick reference and all templatized areas).
- [2026-03-09] Event: Task 2 completed — created `docs/plug-in-chef-playbook.md` (combined runbook + client onboarding checklist, 8 phases, “Chef sees” notes, good-enough 2-week demo defined).
- [2026-03-09] Event: Task moved to completed. Updated all status references and file paths from active/ to completed/ throughout task directory.

## Implementation Checklist
- [x] Task 1: Write the Templatized Values Inventory document — `docs/templatized-values-inventory.md` created.
- [x] Task 2: Write the Combined Playbook (runbook + client onboarding checklist) — `docs/plug-in-chef-playbook.md` created.
- [x] Inventory all templatized values (branding, copy, products, config, env) and map them to their locations in the repo.
- [x] Draft a step-by-step "plug in the chef" runbook from interest → dev demo (2 weeks) → first mock order (~1 month).
- [x] Design a client onboarding checklist that teams can follow to reliably hit the 2-week / 1-month targets.
- [ ] Identify any missing automation or scripts that would make the checklist easier to follow (optional follow-up task).

## Open Questions
- Are there client-specific edge cases (e.g., bookings, menus, special flows) that should be included in the base checklist vs. left to per-client customization?

## References
- Mission: `.devagent/workspace/product/mission.md` (2026-03-08) — defines the template-for-clients model and 2-week / 1-month success targets.
- Roadmap: `.devagent/workspace/product/roadmap.md` (2026-03-08) — Horizon 2 focuses on templatized surface and repeatable onboarding.
- Guiding Questions: `.devagent/workspace/product/guiding-questions.md` (2026-03-08) — captures the need to document templatized values and define the plug-in-the-chef checklist.
- Clarification: `clarification/2026-03-08_initial-clarification.md` (2026-03-08) — clarified requirements; plan-ready.
- Research: `research/2026-03-09_templatized-values-inventory.md` (2026-03-09) — templatized values and file locations for inventory and playbook.
- Plan: `plan/2026-03-09_plug-in-chef-docs-plan.md` (2026-03-09) — implementation plan for inventory doc and combined playbook.
- Deliverables: `docs/templatized-values-inventory.md`, `docs/plug-in-chef-playbook.md` (2026-03-09) — inventory and combined runbook + onboarding checklist.
