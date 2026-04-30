# Clarified Requirement Packet — Chef Events calendar filters

- **Requestor:** PabloJVelez [INFERRED: task hub owner]
- **Decision Maker:** PabloJVelez [INFERRED]
- **Date:** 2026-04-29
- **Mode:** Task Clarification
- **Status:** Complete
- **Related Task Hub:** `.devagent/workspace/tasks/active/2026-04-29_chef-events-calendar-filters/`

## Task Overview

### Context

- **Task name/slug:** `2026-04-29_chef-events-calendar-filters` — Chef Events admin calendar filtering (status multi-select + Medusa-style UX).
- **Business context:** Calendar shows all events including completed/cancelled; chefs need to focus on actionable statuses. Orders page is the visual/UX reference.
- **Stakeholders:** PabloJVelez (owner / decision maker) [INFERRED]
- **Prior work:** Research packet `.devagent/workspace/tasks/active/2026-04-29_chef-events-calendar-filters/research/2026-04-29_chef-events-calendar-filtering.md` (2026-04-29).

### Clarification Sessions

- **Session 1 (2026-04-29):** Round 1 — three product decisions answered (PabloJVelez). Packet finalized for handoff to `devagent create-plan`.

---

## Clarified Requirements

### Scope & End Goal

**What needs to be done?**

- Ship **status-only** filtering on the Chef Events admin calendar for **v1** (no event type, location, text search, or date-range filters in v1 unless explicitly pulled into a later phase).
- Chefs must be able to **include one or more** of the four lifecycle statuses (`pending`, `confirmed`, `cancelled`, `completed`) so they can widen beyond the default when needed.
- **Default behavior (no filter-related query params):** show only **`pending` + `confirmed`** — hide `completed` and `cancelled` until the chef explicitly adds those statuses via the filter UI.
- **Persistence:** encode filter choices in **URL query parameters only** (same family as existing `date`, `view`, `incident`) so refresh and shared links reproduce the same filtered calendar.

**End state**

- API supports listing chef events constrained by **one or many** statuses (server-side; not client-only discard at `limit: 1000`).
- Admin calendar shows a Medusa-aligned filter affordance (Orders-style “add / manage filters” feel) wired to URL params; month and agenda views both respect the same filter state.

**In-scope (must-have)**

- Multi-select (or equivalent) **status** filter UI on the calendar page.
- **Default URL-absent** behavior = `pending` + `confirmed` only.
- URL-serialized filter state; compatible with existing calendar params.

**Out-of-scope for v1 (explicit)**

- Non-status filters: location type, event type, text search, date-range filter bar.
- Changing Google Calendar sync / incident drawer behavior except where URL layout must remain coherent.

**Nice-to-have (defer to post-v1)**

- Secondary filters from the original brainstorm (experience type, `q` search, date window, deposit, etc.).

---

### Technical Constraints & Requirements

- Reuse patterns documented in task research: extend `GET /admin/chef-events` (and SDK types) for multi-status; avoid relying on client-side filtering alone for the default “quieter” calendar.
- Medusa admin UX alignment (Orders reference); implementation detail left to **create-plan** (e.g. `@medusajs/ui` toolbar vs minimal controls).

---

### Dependencies & Blockers

- Confirm in implementation spike that `listAndCountChefEvents` accepts `status: { $in: string[] }` (research expectation; not a clarification blocker).

---

### Implementation Approach

- **Defaults:** When status filter params are absent from the URL, the client should request the API with statuses **`pending` and `confirmed` only`** (or use agreed query encoding documented in the plan).
- **Persistence:** All filter state reflected in URL; no localStorage for filter defaults beyond what the URL implies.

---

### Acceptance Criteria & Verification

- **Default:** Opening Chef Events with a “clean” URL (no status filter keys) shows **only** pending and confirmed events on the calendar.
- **Widen:** Chef can add **`cancelled`** and/or **`completed`** (and remove any status) via the filter UI; calendar and any counts/load behavior match selection.
- **Persistence:** Copy-pasting the URL in another tab or after hard refresh shows the **same** set of events.
- **Views:** Month and Agenda both respect the same status filter state.
- **Medusa feel:** Filter entry/edit UX is recognizably in line with admin Orders filter patterns (subjective check + screenshot in plan QA).
- **v1 scope:** No non-status filters shipped in the same release unless explicitly re-scoped.

---

## Question Tracker

| ID | Topic | Question (summary) | Status |
| --- | --- | --- | --- |
| Q1 | Defaults | On first load (no filter params), which events should the calendar show? | ✅ answered — **B:** `pending` + `confirmed` only (PabloJVelez, 2026-04-29) |
| Q2 | Secondary filters | Which non-status filters are must-have for v1? | ✅ answered — **E:** status only for v1 (PabloJVelez, 2026-04-29) |
| Q3 | Persistence | How should filter choices persist across refresh / shareable links? | ✅ answered — **A:** URL query params only (PabloJVelez, 2026-04-29) |

---

## Assumptions Log

| Assumption | Owner | Validation Required | Validation Method | Status |
| --- | --- | --- | --- | --- |
| Single-chef admin; no multi-tenant filter presets | PabloJVelez | Optional | Confirm if wrong | Pending |
| Filters apply to both Month and Agenda views | PabloJVelez | Yes | Acceptance criteria | Validated (requirement) |

---

## Gaps Requiring Research

- **`q` / text search on `GET /admin/chef-events`:** Not required for v1 per Q2 **E**; defer any spike to post-v1 or a follow-up task if search is added later.

---

## Clarification Session Log

### Session 1 — 2026-04-29

**Participants:** PabloJVelez (async via Cursor), DevAgent clarification workflow.

**Round 1 — Questions and answers**

1. **Default calendar load (no filter query params)**  
   **Answer:** **B** — Show only **`pending` + `confirmed`** by default; chef widens to include `completed` / `cancelled` via filters. *(PabloJVelez, 2026-04-29)*

2. **Must-have filters besides status in v1**  
   **Answer:** **E** — **Status only** for v1. *(PabloJVelez, 2026-04-29)*

3. **Filter persistence / URL**  
   **Answer:** **A** — **URL query params only** for filter state (refresh + shareable links). *(PabloJVelez, 2026-04-29)*

**Unresolved Items:** None for v1 product scope.

---

## Next Steps

### Spec / plan readiness

**Status:** Ready for `devagent create-plan`.

**Rationale:** Defaults, v1 filter surface (status-only), and persistence are decided. Research packet already covers API/UI patterns; remaining work is technical design (param names, `$in` shape, UI component choice) suitable for the plan.

**Handoff**

- [ ] Run **`devagent create-plan`** using this packet + `.devagent/workspace/tasks/active/2026-04-29_chef-events-calendar-filters/research/2026-04-29_chef-events-calendar-filtering.md`.

### Change log

| Date | Change |
| --- | --- |
| 2026-04-29 | Initial packet; Session 1 Round 1 questions recorded. |
| 2026-04-29 | Round 1 answered (B, E, A); requirements merged; status → Complete. |
