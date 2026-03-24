# React Email Preview Server Progress Tracker

- Owner: PabloJVelez
- Last Updated: 2026-03-23
- Status: Draft
- Task Hub: `.devagent/workspace/tasks/active/2026-03-23_react-email-preview-server/`

## Summary

We need to add the React Email preview server workflow to this project so developers can preview transactional email templates locally in the browser instead of sending test messages. A sibling codebase (**sdoa**) already completed this work under task `2026-02-15_react-email-preview-server`; the owner is supplying that task’s clarification, research, plan, and AGENTS artifacts as the primary reference for how to implement the same behavior here. This repository already wires `dev:email` (`email dev --dir ./src/modules/resend/emails`) and depends on `react-email` and `@react-email/preview-server` in `apps/medusa`, but the email modules under `apps/medusa/src/modules/resend/emails/` currently use named exports only (no `export default`), which typically prevents the preview server from listing templates—so the task is to align scripts, exports, and any conveniences (for example fixed preview port and optional `dev:all`) with the proven sibling approach while keeping Resend integration working via existing named exports.

## Agent Update Instructions

- Always update "Last Updated" to today's date (ISO: YYYY-MM-DD) when editing this file. **Get the current date by explicitly running `date +%Y-%m-%d` first, then use the output for the "Last Updated" field.**
- Progress Log: Append a new entry at the end in the form `- [YYYY-MM-DD] Event: concise update, links to files`. Do not rewrite or delete prior entries. **Use the date retrieved from `date +%Y-%m-%d` for the date portion.**
- Implementation Checklist: Mark items as `[x]` when complete, `[~]` for partial with a short note. Add new items if discovered; avoid removing items—strike through only when obsolete.
- Key Decisions: Record important decisions as `- [YYYY-MM-DD] Decision: rationale, links`. **Use the date retrieved from `date +%Y-%m-%d` for the date portion.**
- References: Keep links current to latest spec, research, and tasks. Add additional references as they are created.
- Scope: Edits here should reflect coordination/progress only; do not include application code changes. Preserve history.

## Key Decisions

- [2026-03-23] Decision (from research): Five templates in `apps/medusa/src/modules/resend/emails/` match sibling scope; gap is `export default` / `PreviewProps` (and optional script tweaks), not directory layout. Rationale: grep + `service.ts` import map; React Email CLI sidebar heuristics. Link: `research/2026-03-23_react-email-preview-server-research.md`.
- [2026-03-23] Decision (from plan): Adopt sibling-style scripts for this repo—`dev:email` on port **3001**, **`dev:all`** with **`concurrently`** in `apps/medusa`, unless implementer hits port conflicts (override locally). Rationale: matches completed sdoa task and research recommendation; single clear default. Link: `plan/2026-03-23_react-email-preview-server-implementation-plan.md`.

## Progress Log

- [2026-03-23] Event: Task hub created via `devagent new-task`. Scope: bring React Email preview server setup to this project using sibling task artifacts as reference; downstream research/plan/implementation to follow.
- [2026-03-23] Event: Research completed. Confirmed five templates, named exports only, no `dev:all`/`concurrently` in `apps/medusa`; preview requires `export default` + optional `PreviewProps` per React Email CLI. Packet: `research/2026-03-23_react-email-preview-server-research.md`.
- [2026-03-23] Event: Implementation plan created (Task 1: `package.json` scripts + `concurrently`; Task 2: five templates with default export + `PreviewProps` + exported types). Plan: `plan/2026-03-23_react-email-preview-server-implementation-plan.md`.
- [2026-03-23] Event: **Task 1 implemented.** `apps/medusa/package.json`: `dev:email` uses `--port 3001`, added `dev:all` with `concurrently`, devDependency `concurrently@^9.2.1`; `yarn.lock` updated (`YARN_ENABLE_IMMUTABLE_INSTALLS=false yarn install`).
- [2026-03-23] Event: **Task 2 implemented.** All five files under `apps/medusa/src/modules/resend/emails/`: `export type` for props, `Component.PreviewProps` with sample data, `export default` component; named exports unchanged for Resend.

## Implementation Checklist

- [x] Research: Compare this repo’s `apps/medusa` Resend email layout, scripts, and export patterns to the sibling completed task; confirm template set and any path or service differences.
- [x] Plan: Produce an implementation plan adapted from the sibling plan (scripts, `concurrently` if desired, per-template `export default` / `PreviewProps` / exported types while preserving named exports for Resend).
- [x] Implement: Apply agreed package.json and template changes; avoid breaking `apps/medusa/src/modules/resend/service.ts` named imports.
- [~] Verify: `yarn dev:email` from `apps/medusa` lists and renders all templates; at least one Resend-driven flow still sends correctly. **Note:** Manual preview + Resend smoke test not run in this session; `yarn typecheck` still fails on pre-existing admin errors (`root.tsx`, chef-events page, `EmailManagementSection`) — no new errors reported in modified email files (IDE lint clean).

## Open Questions

- (None blocking plan approval — port `3001` + `dev:all` + `concurrently` adopted as default in plan; local port conflicts can override ad hoc.)

## References

- [2026-03-23] `plan/2026-03-23_react-email-preview-server-implementation-plan.md` — Two-task implementation plan and acceptance criteria.
- [2026-03-23] `research/2026-03-23_react-email-preview-server-research.md` — Current-repo inventory, CLI behavior, recommendations for planning.
- [2026-03-23] `apps/medusa/package.json` — `dev:email`, `react-email`, `@react-email/preview-server` dependencies.
- [2026-03-23] `apps/medusa/src/modules/resend/emails/` — React Email template modules (named exports today; preview discovery to validate in research).
- [2026-03-23] `.devagent/workflows/new-task.md` — Scaffolding workflow used to create this hub.
- [2026-03-23] `.devagent/AGENTS.md` — Project workflow roster and standard instructions.
- [2026-03-23] Sibling completed task hub (reference only, outside this repo): `/Users/pablo/Personal/development/sdoa/sdoa/.devagent/workspace/tasks/completed/2026-02-15_react-email-preview-server/` — includes `AGENTS.md`, `clarification/2026-02-15_initial-clarification.md`, `research/2026-02-15_react-email-preview-server-and-directory-research.md`, `plan/2026-02-15_react-email-preview-server-implementation-plan.md`.

## Next Steps

- **Manual verify:** From `apps/medusa`, run `yarn dev:email` → open http://localhost:3001 → confirm five templates render; optionally `yarn dev:all` for Medusa + preview together.
- **Regression:** Trigger one Resend notification path; then run **`devagent mark-task-complete`** when satisfied.
