# Chef Events calendar — status filters (v1) Plan

- **Owner:** PabloJVelez
- **Last Updated:** 2026-04-29
- **Status:** Draft
- **Related Task Hub:** `.devagent/workspace/tasks/completed/2026-04-29_chef-events-calendar-filters/`
- **Stakeholders:** PabloJVelez (decision maker)

---

## PART 1: PRODUCT CONTEXT

### Summary

The Chef Events admin calendar loads a large unfiltered list (`limit: 1000`), so **completed** and **cancelled** events clutter the view. This plan delivers **v1 status-only** filtering: chefs choose which lifecycle statuses to include, with **pending + confirmed** as the default when the URL carries no status selection, and **filter state stored only in URL query parameters** (alongside existing `date`, `view`, `incident`). The list API gains **multi-status** support server-side so the default is not implemented by downloading every row and hiding it in the browser.

### Context & Problem

- Current behavior and file anchors are documented in `.devagent/workspace/tasks/completed/2026-04-29_chef-events-calendar-filters/research/2026-04-29_chef-events-calendar-filtering.md`.
- Product decisions (defaults, v1 scope, persistence) are locked in `.devagent/workspace/tasks/completed/2026-04-29_chef-events-calendar-filters/clarification/2026-04-29_initial-clarification.md`.

### Objectives & Success Metrics

| Objective | How we know |
| --- | --- |
| Quieter default calendar | With no `statuses` (or agreed param) in URL, only **pending** and **confirmed** events render in Month and Agenda. |
| Chef control | User can include **cancelled** and/or **completed**; resulting events match selection after refetch. |
| Shareable state | Full URL copied to a new tab reproduces the same events. |
| Medusa-aligned UX | Filter affordance and layout are consistent with admin Orders filter bar placement (between page chrome and primary content), using `@medusajs/ui` primitives rather than importing `~dashboard` `_DataTable` (calendar is not a table). |

### Users & Insights

- **Primary user:** single-chef operator in Medusa admin scheduling events and reviewing Google Calendar sync incidents on the same page.

### Solution Principles

- **Server-side filtering** for status (no client-only hiding at full list scale).
- **URL as source of truth** for filter persistence (no `localStorage` for filters).
- **Backward compatible API** where feasible: other callers of `GET /admin/chef-events` without new params should retain **current** semantics (all statuses, subject to existing `status` / `eventType` / `locationType` filters). The **calendar** applies the pending+confirmed default by always sending an explicit multi-status query when the URL omits status selection—avoid changing global API default silently.

### Scope Definition

- **In scope:** Multi-status query support on `GET /admin/chef-events`; SDK/query typing; calendar URL parse/serialize; toolbar UI for four statuses; wiring `useAdminListChefEvents`; layout coexistence with Google Calendar sync strip and existing calendar controls.
- **Out of scope (v1):** Non-status filters, text `q` behavior changes, date-range limits on the list, changing `limit: 1000` (note under risks).

### Functional Narrative

#### Flow: First visit (clean URL)

- **Trigger:** User opens Chef Events; URL has no status filter param.
- **Behavior:** Client resolves effective status set to `['pending','confirmed']` and calls the list API with that set (without requiring those values to appear in the URL). Calendar renders only matching events.
- **Acceptance:** No `completed` or `cancelled` rows are requested from the API for this load (verify in network tab or integration test if added later).

#### Flow: Widen to completed / cancelled

- **Trigger:** User adds statuses via the filter UI.
- **Behavior:** Selected statuses are written to the URL (single param, see below). List refetches with `status: { $in: [...] }`. Month and Agenda update.

#### Flow: Share / refresh

- **Trigger:** User copies URL or refreshes.
- **Behavior:** Parsed statuses from URL drive the same fetch as before.

### Technical Notes & Dependencies

- **Query param name:** Use **`statuses`** as a comma-separated list (e.g. `statuses=pending,confirmed,cancelled`) to avoid overloading legacy single `status` and to keep parsing explicit. Reserved values: only the four enum strings; invalid tokens stripped or request rejected with `400` (pick one approach in implementation and document in route).
- **API filter shape:** `listAndCountChefEvents({ status: { $in: [...] }, ...other filters }, { take, skip, order })` — validate with a quick runtime spike if types are unclear (see Risks).
- **Legacy `status` query:** Continue to support existing single `status` for backward compatibility; if both `status` and `statuses` appear, define precedence (`statuses` wins) in code comments.

---

## PART 2: IMPLEMENTATION PLAN

### Scope & Assumptions

- **Scope:** Medusa app `apps/medusa` — admin API route, SDK, admin calendar route/components only.
- **Assumption:** `ChefEventModuleService.listAndCountChefEvents` accepts Medusa-style `$in` on `status` (same pattern as `apps/medusa/src/api/store/menus/route.ts`).
- **Out of scope:** Storefront, non-admin consumers of chef-events list (none found in repo grep besides admin calendar hook).

### Implementation Tasks

#### Task 1: Multi-status filtering on `GET /admin/chef-events`

- **Objective:** Accept multiple statuses via `statuses` (comma-separated) and apply server-side `$in` filter; preserve existing `eventType`, `locationType`, `q`, pagination; document interaction with legacy `status`.
- **Impacted modules/files:** `apps/medusa/src/api/admin/chef-events/route.ts` (primary).
- **References:** Research packet §2–3; `apps/medusa/src/api/store/menus/route.ts` for `$in` example; `.cursor/rules/medusa-development.mdc` (Zod validation at API boundary).
- **Dependencies:** None (first task).
- **Acceptance criteria:**
  - [ ] `GET /admin/chef-events?statuses=pending,confirmed` returns only those statuses (manual or automated check).
  - [ ] `GET /admin/chef-events?statuses=completed` returns only completed.
  - [ ] Invalid status token in list yields `400` **or** documented strip behavior—choose one and add a short comment in the route.
  - [ ] Omitting `statuses` (and omitting legacy `status` / `all` handling) leaves **unchanged** list semantics for non-calendar callers (still “all statuses”).
- **Testing criteria:** Add or extend an **integration** or **API** test under existing Medusa test layout if the repo has a pattern for admin routes; otherwise document manual verification steps in the PR description and run local `curl`/admin network verification.
- **Subtasks:**
  1. Parse `req.query.statuses` (string) → split, trim, dedupe, validate against `['pending','confirmed','cancelled','completed']`.
  2. Build `filters.status = { $in: parsed }` when non-empty.
  3. Merge with existing single `status` only when `statuses` absent (preserve legacy).
- **Validation plan:** Hit route with combinations; confirm SQL/ORM filter via logging in dev if needed (remove before merge).

#### Task 2: SDK and list query types

- **Objective:** Expose `statuses` on the admin list query type and ensure the JS SDK `fetch` sends a query string the route accepts (comma-separated single param is default `fetch` behavior for a string).
- **Impacted modules/files:** `apps/medusa/src/sdk/admin/admin-chef-events.ts` (`AdminListChefEventsQuery`, `list()`), any local type re-exports consuming that interface.
- **References:** Existing `AdminListChefEventsQuery` fields.
- **Dependencies:** Task 1 merged or coordinated (types should match route).
- **Acceptance criteria:**
  - [ ] TypeScript consumers can pass `statuses: ['pending','confirmed']` or a documented `string` form consistent with `sdk.admin.chefEvents.list`.
  - [ ] No regression on existing optional `status`, `eventType`, `locationType`, `q`, `limit`, `offset`.
- **Testing criteria:** `yarn typecheck` (or package-scoped equivalent) for `apps/medusa` passes for touched files.
- **Validation plan:** CI / local typecheck.

#### Task 3: URL encoding/decoding and default status resolution

- **Objective:** Centralize parsing and serialization of `statuses` query param against `useSearchParams`; define **`DEFAULT_CALENDAR_STATUSES`** as `['pending','confirmed']`; when param absent, use default for API calls only (do not force-write URL on mount unless product later asks for explicit encoding).
- **Impacted modules/files:** New helper module under `apps/medusa/src/admin/routes/chef-events/` (e.g. `chef-event-calendar-status-params.ts`) **or** colocated helpers in `chef-event-calendar.tsx` if kept very small; avoid deep import cycles.
- **References:** Existing constants in `chef-event-calendar.tsx` (`CALENDAR_DATE_PARAM`, etc.); `statusOptions` / enum list in `apps/medusa/src/admin/routes/chef-events/schemas.ts` for canonical labels/order.
- **Dependencies:** Task 2 for query shape passed to `useAdminListChefEvents`.
- **Acceptance criteria:**
  - [ ] Absent `statuses` param → hook receives `pending` + `confirmed` only.
  - [ ] Present param round-trips: edit URL manually → calendar matches.
  - [ ] Stable ordering of statuses in URL (e.g. sort) to reduce diff noise.
- **Testing criteria:** **Unit tests** for pure parse/serialize functions (preferred location: colocated `*.test.ts` next to helper or under `apps/medusa/src/admin/routes/chef-events/__tests__/` if that matches repo convention).
- **Validation plan:** `yarn test` subset for new unit file.

#### Task 4: Calendar UI — status filter toolbar + data wiring

- **Objective:** Add a Medusa-styled toolbar (filter menu or multi-toggle/checkbox group) **below** the Google Calendar sync strip and **above** Today/Back/Next navigation; bind to URL; call `useAdminListChefEvents` with `{ statuses: effectiveSet, limit: 1000, offset: 0, ... }` and remove empty-string sentinels for unused v1 filters (keep `eventType`/`locationType` absent or omit keys rather than `''` if SDK supports it).
- **Impacted modules/files:** `apps/medusa/src/admin/routes/chef-events/components/chef-event-calendar.tsx` (primary); possibly `apps/medusa/src/admin/routes/chef-events/page.tsx` if layout is cleaner with a wrapper; `apps/medusa/src/admin/styles/*` only if spacing tokens require it.
- **References:** Medusa UI [Data Table / filters](https://docs.medusajs.com/ui/components/data-table#configure-filters-in-datatable) for interaction patterns (use `Checkbox`, `DropdownMenu`, or `Button`+`Popover` from `@medusajs/ui` if full `DataTable` is awkward without a grid); Orders placement reference `apps/medusa/src/admin/overrides/order-list-table.tsx` (toolbar spacing only, not `_DataTable` import).
- **Dependencies:** Tasks 1–3.
- **Acceptance criteria:**
  - [ ] Default UI reflects pending+confirmed when URL has no `statuses`.
  - [ ] User can add/remove **completed** and **cancelled**; URL updates; refetch matches.
  - [ ] Month and Agenda both use the same effective set.
  - [ ] Incident drawer / selected incident resolution still finds chef events when incident’s event is inside filtered set; if filtered out, document behavior (e.g. drawer empty state) — prefer still allowing navigation via `incident` param to **retrieve** single event if needed (out of scope unless broken; verify manually).
- **Testing criteria:** Manual QA script in PR: default load, toggle statuses, refresh, copy URL, mobile width; align with `.cursor/rules/testing-patterns-e2e.mdc` only if an e2e suite already covers admin routes (do not add e2e infra solely for this task unless required by project).
- **Validation plan:** Manual screenshot comparison to Orders filter bar density (optional attachment in PR).

### Implementation Guidance

- **From `.cursor/rules/medusa-development.mdc`:** Validate admin `GET` inputs with **Zod**; use **`MedusaError`** for predictable 4xx responses when rejecting bad `statuses` (see medusa-development.mdc § API Route Patterns / Error Handling).
- **From `.cursor/rules/testing-patterns-unit.mdc`:** Prefer **AAA** unit tests for pure URL/status helpers; behavior-focused names; isolation without brittle DOM coupling.
- **From `.devagent/workspace/tasks/completed/2026-04-29_chef-events-calendar-filters/research/2026-04-29_chef-events-calendar-filtering.md`:** Do not rely on client-side filtering alone for status; avoid changing global list default without explicit query from calendar.

---

## Risks & Open Questions

| Item | Type | Owner | Mitigation / next step |
| --- | --- | --- | --- |
| `listAndCountChefEvents` rejects or ignores `$in` on enum field | Risk | Implementer | Spike in Task 1; if blocked, escalate with ORM error message and consider temporary raw query module extension (last resort). |
| `limit: 1000` with growing history | Risk | Product / later task | Note in PR; follow-up for date-bounded list or pagination—not v1 unless blocking. |
| Incident drawer when filtered event excluded | Question | Implementer | Manual QA; if poor UX, allow `retrieve` by id for incident-linked event without list membership (clarify in PR if code change needed). |
| Duplicate `status` vs `statuses` confusion | Risk | Implementer | Precedence + comment in route; short note in SDK JSDoc. |

---

## Progress Tracking

Use `.devagent/workspace/tasks/completed/2026-04-29_chef-events-calendar-filters/AGENTS.md` — Implementation Checklist and Progress Log during `implement-plan`.

---

## Appendices & References

- Clarification: `.devagent/workspace/tasks/completed/2026-04-29_chef-events-calendar-filters/clarification/2026-04-29_initial-clarification.md`
- Research: `.devagent/workspace/tasks/completed/2026-04-29_chef-events-calendar-filters/research/2026-04-29_chef-events-calendar-filtering.md`
- Code: `apps/medusa/src/admin/routes/chef-events/components/chef-event-calendar.tsx`, `apps/medusa/src/api/admin/chef-events/route.ts`, `apps/medusa/src/sdk/admin/admin-chef-events.ts`, `apps/medusa/src/modules/chef-event/models/chef-event.ts`
- External: [Medusa Admin Data Table / filtering patterns](https://docs.medusajs.com/resources/admin-components/components/data-table#example-datatable-with-data-fetching) (UI inspiration)

### Plan change log

| Date | Change |
| --- | --- |
| 2026-04-29 | Initial plan from research + clarification packets. |
