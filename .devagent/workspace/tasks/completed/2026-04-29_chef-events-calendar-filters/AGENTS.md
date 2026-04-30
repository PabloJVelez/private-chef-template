# Chef Events Calendar Filters Progress Tracker

- Owner: PabloJVelez
- Last Updated: 2026-04-29
- Status: Complete
- Task Hub: `.devagent/workspace/tasks/completed/2026-04-29_chef-events-calendar-filters/`

## Summary

The Chef Events admin calendar currently loads every event, including completed and cancelled ones, which adds noise and pulls attention away from work that needs action soon (for example unconfirmed events, or confirmed events that have not yet completed). This task refactors that experience so chefs can filter by **event status** and choose one or more statuses to display. The UX should follow **Medusa admin patterns**, using the Orders list as the reference: an “Add filter” style flow, consistent filter chips or controls, and alignment with how Medusa surfaces filters elsewhere in the dashboard. **Clarified (2026-04-29):** v1 is **status-only**; default visible statuses when URL has no filter params are **pending + confirmed**; filter state lives in **URL query params** only. Further filters (experience type, date range, search, etc.) are **out of scope for v1** unless re-scoped.

## Agent Update Instructions

- Always update "Last Updated" to today's date (ISO: YYYY-MM-DD) when editing this file. **Get the current date by explicitly running `date +%Y-%m-%d` first, then use the output for the "Last Updated" field.**
- Progress Log: Append a new entry at the end in the form `- [YYYY-MM-DD] Event: concise update, links to files`. Do not rewrite or delete prior entries. **Use the date retrieved from `date +%Y-%m-%d` for the date portion.**
- Implementation Checklist: Mark items as `[x]` when complete, `[~]` for partial with a short note. Add new items if discovered; avoid removing items—strike through only when obsolete.
- Key Decisions: Record important decisions as `- [YYYY-MM-DD] Decision: rationale, links`. **Use the date retrieved from `date +%Y-%m-%d` for the date portion.**
- References: Keep links current to latest spec, research, and tasks. Add additional references as they are created.
- Scope: Edits here should reflect coordination/progress only; do not include application code changes. Preserve history.

## Key Decisions

- [2026-04-29] Decision: Default calendar load (no status filter in URL) shows **pending** and **confirmed** only; **completed** and **cancelled** appear only when the chef widens status filters. Rationale: reduce noise for day-to-day scheduling. Link: `clarification/2026-04-29_initial-clarification.md`.
- [2026-04-29] Decision: **v1 scope is status-only** — no location type, event type, text search, or date-range filters in the same release. Rationale: stakeholder choice **E** in clarification session. Link: same.
- [2026-04-29] Decision: Filter persistence uses **URL query params only** (no localStorage for filters). Rationale: shareable links and refresh-safe state, consistent with existing calendar params. Link: same.

## Progress Log

- [2026-04-29] Event: Task hub scaffolded via `new-task` workflow with summary and seeded references.
- [2026-04-29] Event: Completed task-scoped research packet at `.devagent/workspace/tasks/completed/2026-04-29_chef-events-calendar-filters/research/2026-04-29_chef-events-calendar-filtering.md`.
- [2026-04-29] Event: Started `clarify-task` session — Round 1 questions posted; clarification packet at `.devagent/workspace/tasks/completed/2026-04-29_chef-events-calendar-filters/clarification/2026-04-29_initial-clarification.md`.
- [2026-04-29] Event: Completed `clarify-task` Session 1 — answers B / E / A recorded; packet status Complete; ready for `devagent create-plan`.
- [2026-04-29] Event: Created implementation plan at `.devagent/workspace/tasks/completed/2026-04-29_chef-events-calendar-filters/plan/2026-04-29_chef-events-calendar-filters-implementation-plan.md`.
- [2026-04-29] Event: Implemented plan Tasks 1–4: `GET /admin/chef-events` multi-status (`statuses` + `$in`), SDK `list()` query shaping, `chef-event-calendar-status-params` lib + unit tests, calendar toolbar + URL wiring in `apps/medusa/src/admin/routes/chef-events/components/chef-event-calendar.tsx`. Ran `yarn typecheck` and unit tests for status params.
- [2026-04-29] Event: Medusa Orders–style filter UX: custom `chef-event-calendar-filter-bar.tsx` (text Add filter, chips, Clear all), calendar page `divide-y` stack inside `Container` for alignment with Orders/table card; `yarn typecheck` clean.
- [2026-04-29] Event: Task moved to completed. Updated all status references and file paths from `active/` to `completed/` throughout task directory.

## Implementation Checklist

- [x] Run `devagent research` (or equivalent) to map chef-event model fields, list/calendar data sources, and Medusa admin filter patterns used on Orders.
- [x] Run `devagent clarify-task` if product choices are ambiguous (default status set, URL vs local state for filters).
- [x] Run `devagent create-plan` for UI, API/query, and persistence (e.g. query params) tasks.
- [x] Implement status multi-select filtering per plan (v1); defer non-status filters unless plan explicitly re-scopes.
- [x] Verify calendar month/agenda views and any Google Calendar sync banner remain coherent with new filter bar placement — shipped as unified `divide-y` stack (sync, incidents, filter strip, calendar); spot-check in running admin still worthwhile.

## Open Questions

- (None blocking v1 — resolved in clarification 2026-04-29.) Post-v1: optional filters (type, location, `q`, date window) and performance of list API at scale.

## References

- Prior related work (Google Calendar sync + chef-events UI context): `.devagent/workspace/tasks/completed/2026-04-23_admin-google-calendar-integration/AGENTS.md` — calendar and sync integration on chef events; freshness: 2026-04-29.
- Medusa admin development conventions: `.cursor/rules/medusa-development.mdc` — align admin implementation with project Medusa guidance; freshness: 2026-04-29.
- Internal context search: No matches for `chef event`, `events calendar`, or adjacent phrases in `.devagent/workspace/product/**` as of 2026-04-29.
- Internal context search: No matches in `.devagent/workspace/memory/**` for the same terms as of 2026-04-29.
- Reference screenshots (local, Cursor project assets): `/Users/pablo/.cursor/projects/Users-pablo-Personal-development-private-chef-template-private-chef-template/assets/image-140e9f91-b7ae-4ca5-9f04-07b0cf15a542.png` (Chef Events calendar), `/Users/pablo/.cursor/projects/Users-pablo-Personal-development-private-chef-template-private-chef-template/assets/image-01327aab-1cbe-4676-b297-60608ad3526b.png` (Orders filters); freshness: 2026-04-29.
- Research packet: `.devagent/workspace/tasks/completed/2026-04-29_chef-events-calendar-filters/research/2026-04-29_chef-events-calendar-filtering.md` (freshness: 2026-04-29).
- Clarification packet (complete): `.devagent/workspace/tasks/completed/2026-04-29_chef-events-calendar-filters/clarification/2026-04-29_initial-clarification.md` (freshness: 2026-04-29).
- Implementation plan: `.devagent/workspace/tasks/completed/2026-04-29_chef-events-calendar-filters/plan/2026-04-29_chef-events-calendar-filters-implementation-plan.md` (freshness: 2026-04-29).

## Next Steps

- (Archived.) Optional follow-up: manual QA in Medusa admin (default load, statuses, URL, month/agenda, incident drawer when filtered).
