# Menu Status Lifecycle Implementation Plan

- Owner: PabloJVelez
- Last Updated: 2026-04-26
- Status: Draft
- Related Task Hub: `.devagent/workspace/tasks/active/2026-04-26_refactor-menu-publishing-statuses/`
- Stakeholders: PabloJVelez (Requestor, Decision Maker)
- Notes: Clarification decisions override earlier parity assumptions from research; implement custom status lifecycle (`draft`, `active`, `inactive`) as the source of truth.

---

## PART 1: PRODUCT CONTEXT

### Summary
Refactor menu publication so storefront visibility is status-driven rather than auto-publish on create, and add admin-side menu duplication to speed authoring workflows. The selected lifecycle is custom (`draft`, `active`, `inactive`) with a non-enum persistence strategy for future extensibility, while API boundaries enforce a current allowlist. This improves operational control for chef-facing storefront curation and reduces repetitive content-entry work during menu iteration.

### Context & Problem
Menus currently have no explicit publication status and store routes return menu data without visibility gating. This creates implicit publication behavior and removes draft/review control for newly created menus. Clarification finalized a custom lifecycle model and explicit behavior: default new menus to `draft`, backfill legacy visible menus to `active`, and expose only `active` menus in storefront responses.

Primary source artifacts:
- `.devagent/workspace/tasks/active/2026-04-26_refactor-menu-publishing-statuses/research/2026-04-26_menu-status-parity-research.md`
- `.devagent/workspace/tasks/active/2026-04-26_refactor-menu-publishing-statuses/clarification/2026-04-26_initial-clarification.md`

### Objectives & Success Metrics
- Introduce menu status lifecycle with current contract values: `draft`, `active`, `inactive`.
- Ensure new menu creation defaults to `draft` unless explicitly overridden by approved admin flow.
- Ensure legacy visible menus remain visible post-migration by backfilling to `active`.
- Ensure store menu list/detail responses include only `active` menus.
- Ensure admin create/update validation rejects statuses outside `draft|active|inactive`.
- Add menu duplication capability that creates a reusable copy of an existing menu for faster authoring.

### Users & Insights
- Primary user: project owner/operator managing menu content in admin.
- End beneficiary: chef storefront visitors who should only see intentionally active menus.
- Key insight: explicit publication states are required to support controlled content workflows and reduce accidental storefront exposure.

### Solution Principles
- Keep lifecycle explicit and centralized in menu domain logic.
- Store status as string (non-enum) for forward-compatible expansion.
- Enforce a strict allowlist at API boundary for current release safety.
- Default storefront to least-exposure behavior (`active` only).
- Keep implementation additive and localized to menu module/routes/workflows/tests.

### Scope Definition
- **In Scope:** add menu status field + migration, status-aware create/update handling, store filtering by `active`, admin validation allowlist, menu duplication capability, and automated validation coverage.
- **Out of Scope / Future:** admin UX redesign for advanced state transitions, role-based publishing permissions, dynamic runtime-configured status catalogs, analytics/reporting on status transitions.

### Functional Narrative

#### Flow 1: Create menu in admin
- Trigger: Admin calls menu create endpoint/workflow.
- Experience narrative: Menu persists with `draft` status by default.
- Acceptance criteria: created menu has `status = "draft"` when omitted.

#### Flow 2: Update menu status in admin
- Trigger: Admin updates menu with a valid status value.
- Experience narrative: Menu status updates to one of allowed current values.
- Acceptance criteria: invalid status is rejected; valid status is persisted.

#### Flow 3: Storefront menu retrieval
- Trigger: Store client calls list or detail menu route.
- Experience narrative: Response only includes menus whose status is `active`.
- Acceptance criteria: `draft`, `inactive`, and unknown statuses are excluded from store responses.

#### Flow 4: Duplicate menu in admin
- Trigger: Admin requests duplication for an existing menu.
- Experience narrative: System creates a new menu record by copying menu structure/content from the source menu and sets duplicated menu status to `draft`.
- Acceptance criteria: Duplicate includes source menu content (courses/dishes/ingredients/images/pricing relationships as defined), receives a new ID, and does not auto-activate on storefront.

### Technical Notes & Dependencies
- Requires menu model schema update and migration/backfill logic.
- Requires admin route schema updates and workflow input handling for `status`.
- Requires store route filters for list and detail endpoints.
- Requires a duplicate endpoint/workflow path in admin APIs and menu module service orchestration.
- Requires test additions to avoid regressions in visibility behavior.

---

## PART 2: IMPLEMENTATION PLAN

### Scope & Assumptions
- Scope focus: Medusa menu module, admin/store API routes, menu workflows, and test coverage.
- Key assumptions:
  - Current canonical status allowlist is `draft|active|inactive`.
  - Unknown/future statuses must remain hidden on storefront unless explicitly enabled in future work.
  - Existing visible menus should retain visibility by migration backfill to `active`.
- Out of scope: implementing user-facing admin state-management UX beyond API capability.

### Implementation Tasks

#### Task 1: Introduce menu status domain contract and migration
- **Objective:** Add status persistence and backfill existing menus safely.
- **Impacted Modules/Files:**
  - `apps/medusa/src/modules/menu/models/menu.ts`
  - `apps/medusa/src/modules/menu/migrations/*` (new migration for status column and backfill)
  - `apps/medusa/src/modules/menu/service.ts` (optional helper for status defaults/guards)
- **References:**
  - `.devagent/workspace/tasks/active/2026-04-26_refactor-menu-publishing-statuses/clarification/2026-04-26_initial-clarification.md`
  - `.cursor/rules/medusa-development.mdc`
- **Dependencies:** None.
- **Acceptance Criteria:**
  - `menu` records include a status field stored as string (not DB enum).
  - Migration sets existing visible menus to `active`.
  - New records can carry status and support defaulting behavior downstream.
- **Testing Criteria:**
  - Migration applies and rolls back successfully.
  - Unit/integration coverage validates backfill behavior.
- **Validation Plan:** run migration up/down in local test database and assert resulting status values.

#### Task 2: Apply status-aware behavior to menu create/update workflows and admin APIs
- **Objective:** Enforce allowlist validation and defaulting rules for admin writes.
- **Impacted Modules/Files:**
  - `apps/medusa/src/api/admin/menus/route.ts`
  - `apps/medusa/src/api/admin/menus/[id]/route.ts`
  - `apps/medusa/src/workflows/create-menu.ts`
  - `apps/medusa/src/workflows/update-menu.ts`
  - `apps/medusa/src/modules/menu/service.ts` (if shared validation helper is added)
- **References:**
  - `.devagent/workspace/tasks/active/2026-04-26_refactor-menu-publishing-statuses/clarification/2026-04-26_initial-clarification.md`
  - `.cursor/rules/typescript-patterns.mdc`
- **Dependencies:** Task 1.
- **Acceptance Criteria:**
  - Create defaults status to `draft` when request omits status.
  - Update allows status transition only to `draft|active|inactive`.
  - Admin endpoints reject unknown status values with clear validation errors.
- **Testing Criteria:**
  - Integration tests for create/update status validation paths.
  - Unit tests (if helper introduced) for status guard/default logic.
- **Validation Plan:** execute admin API integration tests for successful and failing status payloads.

#### Task 3: Enforce storefront visibility rules (active-only)
- **Objective:** Ensure store routes return only active menus and hide unknown statuses.
- **Impacted Modules/Files:**
  - `apps/medusa/src/api/store/menus/route.ts`
  - `apps/medusa/src/api/store/menus/[id]/route.ts`
  - `apps/medusa/src/modules/menu/service.ts` (if shared query helper introduced)
- **References:**
  - `.devagent/workspace/tasks/active/2026-04-26_refactor-menu-publishing-statuses/clarification/2026-04-26_initial-clarification.md`
  - `apps/medusa/src/api/store/menus/route.ts` (current baseline behavior)
- **Dependencies:** Task 1.
- **Acceptance Criteria:**
  - Store list endpoint returns menus with `status = "active"` only.
  - Store detail endpoint does not expose non-active menus.
  - Unknown statuses are hidden by default (same as non-active behavior).
- **Testing Criteria:**
  - Integration tests for list/detail filtering by status.
  - Regression test ensuring active menus remain retrievable.
- **Validation Plan:** run store route integration suite with mixed-status fixtures.

#### Task 4: Consolidate constants and add regression-focused test coverage
- **Objective:** Prevent status drift and codify behavior through tests.
- **Impacted Modules/Files:**
  - `apps/medusa/src/modules/menu/*` (new shared status constants/types file if needed)
  - `apps/medusa/src/api/admin/menus/*.test.ts` or equivalent test location
  - `apps/medusa/src/api/store/menus/*.test.ts` or equivalent test location
  - `apps/medusa/src/workflows/*.test.ts` (if workflow-level tests exist)
- **References:**
  - `.cursor/rules/testing-patterns-unit.mdc`
  - `.cursor/rules/testing-patterns-integration.mdc`
- **Dependencies:** Tasks 2-3.
- **Acceptance Criteria:**
  - Current allowlist values are defined once and reused by validation/query logic.
  - Tests cover default create status, invalid status rejection, active-only storefront visibility, and unknown status hiding.
- **Testing Criteria:**
  - Unit tests for shared constants/helpers (if introduced).
  - Integration tests for admin/store route behavior and regression paths.
- **Validation Plan:** run affected test suites and ensure deterministic pass results.

#### Task 5: Add menu duplication workflow and admin API contract
- **Objective:** Provide a reliable way to duplicate an existing menu and its nested content into a new draft menu.
- **Impacted Modules/Files:**
  - `apps/medusa/src/api/admin/menus/[id]/duplicate/route.ts` (new route)
  - `apps/medusa/src/workflows/duplicate-menu.ts` (new workflow)
  - `apps/medusa/src/modules/menu/service.ts` (duplication helper logic as needed)
  - `apps/medusa/src/api/admin/menus/[id]/route.ts` or related route index files (if route wiring updates are needed)
  - `apps/medusa/src/api/admin/menus/*.test.ts` or equivalent integration test location
- **References:**
  - `apps/medusa/src/workflows/create-menu.ts`
  - `apps/medusa/src/workflows/update-menu.ts`
  - `.cursor/rules/medusa-development.mdc`
- **Dependencies:** Tasks 1-2.
- **Acceptance Criteria:**
  - Admin can duplicate an existing menu through a dedicated endpoint.
  - Duplicate menu gets a new ID and `status = "draft"`.
  - Duplicate contains expected nested content from source menu (courses/dishes/ingredients and relevant media/pricing records).
  - Source menu remains unchanged by duplication.
- **Testing Criteria:**
  - Integration tests for successful duplication and missing-source failure.
  - Regression test confirms duplicate is not visible on storefront until activated.
- **Validation Plan:** execute admin duplication tests plus store visibility checks for duplicated draft menus.

### Implementation Guidance
- **From `.devagent/workspace/memory/constitution.md` (C1 Mission-first delivery):**
  - Keep changes tied to template reuse and safe client onboarding; publication controls should be explicit and portable.
- **From `.devagent/workspace/memory/constitution.md` (C2 Quality and maintainability):**
  - Follow documented TypeScript/Medusa/testing standards; keep this phase planning-only, with implementation in a downstream workflow.
- **From `.cursor/rules/medusa-development.mdc`:**
  - Use Medusa module/service patterns, route-level validation, and clear business logic separation.
- **From `.cursor/rules/typescript-patterns.mdc`:**
  - Prefer strong typing and centralized contracts over scattered string literals.
- **From `.cursor/rules/testing-patterns-unit.mdc` and `.cursor/rules/testing-patterns-integration.mdc`:**
  - Use behavior-focused AAA tests and verify route/service integration paths with isolated fixtures.

---

## Risks & Open Questions

| Item | Type (Risk / Question) | Owner | Mitigation / Next Step | Due |
| --- | --- | --- | --- | --- |
| Legacy menu visibility assumptions may not map cleanly to "existing visible menus" during migration | Risk | PabloJVelez | Define concrete migration predicate during implementation and validate on staging-like dataset | Task 1 |
| Storing non-enum status could allow accidental drift if validation is bypassed | Risk | Implementer | Centralize allowlist constant and enforce validation at all write boundaries | Task 2 |
| Store detail route behavior for non-active IDs may impact existing consumers | Risk | Implementer | Explicitly test expected response contract and document in route tests | Task 3 |
| Duplication semantics for optional/derived fields (name suffix, metadata handling) may be ambiguous | Question | PabloJVelez | Finalize duplication rules in implementation notes before coding endpoint behavior | Task 5 |
| Future statuses require code updates until allowlist becomes configurable | Question | PabloJVelez | Track as follow-up enhancement once current lifecycle is stable | Post-MVP |

---

## Progress Tracking
Refer to `.devagent/workspace/tasks/active/2026-04-26_refactor-menu-publishing-statuses/AGENTS.md` for implementation tracking updates.

---

## Appendices & References
- Task hub: `.devagent/workspace/tasks/active/2026-04-26_refactor-menu-publishing-statuses/AGENTS.md`
- Clarification packet: `.devagent/workspace/tasks/active/2026-04-26_refactor-menu-publishing-statuses/clarification/2026-04-26_initial-clarification.md`
- Research packet: `.devagent/workspace/tasks/active/2026-04-26_refactor-menu-publishing-statuses/research/2026-04-26_menu-status-parity-research.md`
- Product mission: `.devagent/workspace/product/mission.md`
- Constitution: `.devagent/workspace/memory/constitution.md`
- Implementation standards: `.cursor/rules/medusa-development.mdc`, `.cursor/rules/typescript-patterns.mdc`, `.cursor/rules/testing-patterns-unit.mdc`, `.cursor/rules/testing-patterns-integration.mdc`
