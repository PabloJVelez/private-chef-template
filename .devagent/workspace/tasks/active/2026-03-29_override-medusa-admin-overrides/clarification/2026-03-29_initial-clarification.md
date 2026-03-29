# Clarified Requirement Packet — Override Medusa Admin with Vite Plugin Unlock

- Requestor: PabloJVelez (inferred from task hub owner) [INFERRED]
- Decision Maker: PabloJVelez [INFERRED]
- Date: 2026-03-29
- Mode: Task Clarification
- Status: In Progress
- Related Task Hub: `.devagent/workspace/tasks/active/2026-03-29_override-medusa-admin-overrides/`
- Notes: Incremental packet; questions below will be updated as the session continues.

## Task Overview

### Context

- **Task name/slug:** Medusa admin overrides via `@unlockable/vite-plugin-unlock` / `2026-03-29_override-medusa-admin-overrides`
- **Business context:** [INFERRED] Private Chef wants branded admin copy and clearer column semantics (“Fulfillment for Event”) without forking `@medusajs/dashboard`.
- **Stakeholders:** PabloJVelez (requestor/decision maker) [INFERRED]; SME: whoever maintains Medusa in this repo [NEEDS CLARIFICATION if different]
- **Prior work:**
  - Task hub: `AGENTS.md` (goals, checklist, open questions)
  - Research: `research/2026-03-29_medusa-admin-overrides-with-vite-plugin-unlock.md`

### Clarification Sessions

- Session 1: 2026-03-29 — Kickoff; first batch of questions (this document)

---

## Clarified Requirements

### Scope & End Goal

**What needs to be done?**

- Integrate `@unlockable/vite-plugin-unlock` (Medusa preset) into the Medusa app so admin can load overrides from a local directory (default `./src/admin/overrides` per plugin docs).
- Override admin UI so that:
  1. Sign-in shows the main welcome heading **"Welcome to Private Chef's Admin"** (exact string from task description).
  2. Orders list table column currently labeled **Fulfillment** shows **"Fulfillment for Event"**.

**What's the end goal architecture or state?**

- [INFERRED] Medusa remains on upstream `@medusajs/dashboard`; only targeted files are shadowed by basename-matched overrides; plugin debug can be used during rollout.

**In-scope (must-have):**

- Plugin wiring in `medusa-config.ts` (or equivalent project config).
- The two copy/label changes above on the standard admin routes affected by the overridden modules.

**Out-of-scope (won't-have):**

- Other admin pages, menus, or deeper visual redesigns beyond the sign-in screen copy and logo for this iteration.

**Nice-to-have (could be deferred):**

- Extra admin copy tweaks, sidebar/menu branding, env-specific strings.

---

### Technical Constraints & Requirements

**Platform/technical constraints:**

- [INFERRED] Must work in local dev (Vite HMR) and production admin build.
- Dependency: `@unlockable/vite-plugin-unlock` as dev dependency; pin/version strategy [NEEDS CLARIFICATION if team policy exists].

**Quality bars:**

- [INFERRED] Preserve authentication and orders list behavior; changes are presentation-only unless explicitly extended.

---

### Dependencies & Blockers

- `@medusajs/dashboard` internal file names for sign-in and orders columns must remain stable or overrides must be updated on upgrade — noted in research.

---

### Implementation Approach

**Implementation strategy:**

- [FROM RESEARCH] Use plugin Medusa preset; overrides matched by basename; prefer thin hook wrapper for column label if a `use-*-columns` hook exists; sign-in likely full page override with `{ Component }` export.

**Design principles:**

- Minimal diff vs upstream; prefer wrapper/copy changes over redesign.

---

### Acceptance Criteria & Verification

**How will we verify this works?**

- [INFERRED] Manual: open admin `/app` sign-in — heading text correct; after login, orders list shows new column header.
- [NEEDS CLARIFICATION] Whether automated or documented QA checklist is required.

**Definition of done:**

- [ ] Both strings appear as specified in admin.
- [ ] No regression on login or orders list loading.

---

## Assumptions Log

| Assumption | Owner | Validation Required | Validation Method | Due Date | Status |
| --- | --- | --- | --- | --- | --- |
| Medusa app supports `admin.vite` plugin config | PabloJVelez | Yes | Read `apps/medusa/medusa-config.ts` during plan/impl | — | Pending |
| Sign-in should update heading, subtitle, and tab title while keeping layout; logo should use a chef hat graphic | PabloJVelez | Yes | Verify implementation against this description | — | Pending |
| Stakeholder/decision maker is task hub owner | PabloJVelez | Yes | User correction if wrong | — | Pending |

---

## Gaps Requiring Research

*(Technical file paths in dashboard — already covered in task research artifact; implementation will confirm exact basenames.)*

---

## Question Tracker

| # | Topic | Status |
| --- | --- | --- |
| Q1 | Sign-in: scope of string/UI changes beyond main heading | ✅ answered (D — heading, subtitle, tab title; chef hat logo requested) |
| Q2 | Orders: scope of “Fulfillment” label rename (list only vs all admin surfaces) | ✅ answered (A — Orders list column only) |
| Q3 | This iteration: strictly two tweaks vs room for bundled copy changes | ✅ answered (A — strictly plugin wiring + two tweaks) |

---

## Clarification Session Log

### Session 1: 2026-03-29

**Participants:** PabloJVelez (assumed) [INFERRED]

**Inferred task concept:** Add `@unlockable/vite-plugin-unlock` to Medusa admin and implement two overrides: (1) sign-in welcome heading → “Welcome to Private Chef's Admin”; (2) Orders list column “Fulfillment” → “Fulfillment for Event”, without forking `@medusajs/dashboard`.

**Already documented (no need to re-ask):** Task hub summary matches this; research packet covers plugin wiring, basename matching, and likely override strategies (page vs hook).

**Questions Asked (awaiting answers):**
 
1. Q1 — answered: Option D. Update sign-in heading, subtitle, and document/tab title to Private Chef–specific copy; also request chef hat logo if feasible.
2. Q2 — answered: Option A. Only Orders list table column currently labeled “Fulfillment” should become “Fulfillment for Event”.
3. Q3 — answered: Option A. Scope is limited to wiring the plugin plus these two UI changes; any additional tweaks are a separate task.

**Unresolved Items:**

- Confirm decision maker / additional stakeholders if not sole owner

---

## Next Steps

### Spec Readiness Assessment

**Status:** Ready for Spec

**Rationale:** Scope boundaries for sign-in copy (including subtitle and tab title), logo change, and Orders Fulfillment label (Orders list column only) are now confirmed; remaining details can be handled in planning/implementation.

### Recommended Actions

- After this session: `devagent create-plan` with clarified scope.
- If Medusa config differs from assumptions: note in plan under dependencies.

---

## Change Log

| Date | Change | Author |
| --- | --- | --- |
| 2026-03-29 | Initial packet; Session 1 kickoff | Clarify workflow |
| 2026-03-29 | Updated with answers to Q1–Q3 and clarified scope/logo requirements | Clarify workflow |
