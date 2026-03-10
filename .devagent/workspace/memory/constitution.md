# Constitution

## Preamble
- **Purpose:** Define delivery principles and guardrails so product mission and implementation stay aligned.
- **Scope:** All work under `.devagent/workspace/`, task hubs, and agent workflows that consume product context.
- **Stewardship model:** Session owner (repository maintainer) maintains; changes proposed via workflow or task research, confirmed before amendment.

## How to Amend
1. **Proposal capture:** Draft in task hub research note or guiding-questions; optional `devagent update-constitution` for larger changes.
2. **Validation steps:** Check alignment with mission, existing clauses, and project standards.
3. **Versioning:** Amendment Log below; archive old versions in commit history.

## Clause Format
Each clause: **Statement** (binding guidance), **Steward**, **Refresh cadence**, **Traceability**.

## Clause Directory
| Clause | Last Reviewed | Next Review Due | Notes |
|--------|---------------|-----------------|-------|
| C1 | 2026-03-08 | 2026-06-08 | Initial creation |
| C2 | 2026-03-08 | 2026-06-08 | Initial creation |

## Clauses

### C1. Mission-first delivery
- **Statement:** Plans, specs, and implementation tasks must trace to the product mission and roadmap. Work that cannot be justified against mission goals should be deferred or re-scoped.
- **Steward:** Session owner / product lead
- **Refresh cadence:** Quarterly or when mission is updated
- **Traceability:** `.devagent/workspace/product/mission.md`, roadmap, task hub AGENTS.md

### C2. Quality and maintainability
- **Statement:** Code and docs follow project standards (TypeScript patterns, Medusa/Remix conventions, testing and accessibility rules). No application code from documentation-only workflows (research, create-plan, clarify-task, etc.) unless explicitly implementing a plan.
- **Steward:** Implementing developer / agent
- **Refresh cadence:** When tech stack or cursor rules change
- **Traceability:** `.cursor/rules/*.mdc`, `ai-rules/`, docs

## Related Artifacts
- `.devagent/workspace/product/mission.md`, `roadmap.md`, `guiding-questions.md`
- `.devagent/workspace/memory/decision-journal.md`
- Task hubs under `.devagent/workspace/tasks/`

## Amendment Log
| Date | Change Summary | Clauses | Notes |
|------|----------------|---------|-------|
| 2026-03-08 | Initial constitution from update-product-mission session | C1, C2 | Session owner: PabloJVelez |
