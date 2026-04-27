# Event Menu Template Derivation Plan

- Owner: PabloJVelez
- Last Updated: 2026-04-26
- Status: Draft
- Related Task Hub: `.devagent/workspace/tasks/active/2026-04-26_event-menu-template-derivation/`
- Stakeholders: PabloJVelez (Requestor, Decision Maker)
- Notes: Built from completed research + clarification artifacts; implementation starts only after explicit execution approval.

---

## PART 1: PRODUCT CONTEXT

### Summary
This plan introduces an event-specific menu customization flow where chef events can derive editable draft menus from template menus without mutating shared templates. The direction is to preserve template integrity, lock template lineage once derivation occurs, and reuse existing menu duplication primitives for reliability and speed in this template-oriented private-chef platform.

### Context & Problem
Current chef-event flows reference a template menu id directly and expose template menu navigation from event details. This creates a risk that event-specific edits mutate reusable template menus. The task is triggered by real operator workflow needs: events often require menu deviations that should be isolated to the event. Research confirms the codebase already has strong duplication primitives and a draft/active lifecycle model that can support this with minimal architectural disruption.

### Objectives & Success Metrics
- Ensure event menu edits never modify template menu data.
- Ensure first event customization creates a derived menu draft and associates it to the event.
- Ensure subsequent event customizations reuse the same derived menu (no duplicate forks).
- Ensure derived menus remain non-storefront-visible by default (`draft` unless explicitly activated elsewhere).
- Ensure template linkage is locked after derivation for lineage consistency.

### Users & Insights
- Primary operator: chef/admin user managing chef events in admin.
- Key insight from clarification: operators need event flexibility while preserving a clean reusable template library.
- Demand signal: explicit requirement from requestor and confirmed decision-maker directives in clarification packet.

### Solution Principles
- Template integrity is non-negotiable for event context.
- Reuse existing Medusa module/workflow patterns already present in repo.
- Keep lifecycle behavior consistent with existing menu status model.
- Prefer explicit UI actions that distinguish template viewing from event customization.

### Scope Definition
- **In Scope:** Event menu derivation data model update, create-or-get workflow/API route, SDK/hook wiring, chef-event UI action updates, regression tests for lineage/lifecycle behavior.
- **Out of Scope / Future:** Multi-chef ownership models, advanced lineage/audit metadata expansions, rollout/process tasks.

### Functional Narrative

#### Event Menu Customization Flow
- Trigger: Admin user opens chef-event detail and clicks customize/edit event menu action.
- Experience narrative:
  1. If no derived menu exists, system duplicates template menu into a new draft menu and links it to event.
  2. If derived menu exists, system opens existing derived menu.
  3. Template menu remains unchanged and no longer acts as editable target from event context.
- Acceptance criteria:
  - Event edit path never writes to source template.
  - Derived menu starts as draft and is hidden from storefront by lifecycle rules.
  - Template reference is locked once derivation exists.

### Technical Notes & Dependencies
- Existing dependency primitives:
  - `duplicateMenu` service method.
  - `duplicate-menu` workflow.
  - Admin menu duplication endpoint and SDK mutation pattern.
- Required dependency additions:
  - Chef-event model field for derived event menu id.
  - Chef-event workflow/API orchestration for create-or-get behavior.

---

## PART 2: IMPLEMENTATION PLAN

### Scope & Assumptions
- Scope focus: Medusa backend + admin customization for chef-event/menu linkage behavior.
- Key assumptions:
  - Decision maker approvals from clarification remain current.
  - Existing menu status behavior (`draft`, `active`, `inactive`) remains unchanged.
  - Existing menu duplication logic is authoritative for nested cloning behavior.
- Out of scope:
  - Reworking global menu publishing lifecycle.
  - Multi-tenant admin/menu ownership concerns.

### Implementation Tasks

#### Task 1: Add Event-Derived Menu Link in Chef Event Domain
- **Objective:** Introduce a dedicated chef-event field to store the event-owned derived menu id, separate from `templateProductId`.
- **Impacted Modules/Files:**
  - `apps/medusa/src/modules/chef-event/models/chef-event.ts`
  - `apps/medusa/src/modules/chef-event/migrations/*` (new migration)
  - `apps/medusa/src/sdk/admin/admin-chef-events.ts`
  - `apps/medusa/src/admin/routes/chef-events/components/chef-event-form.tsx` (read-only/visibility adjustments if needed)
- **References:** Research + clarification artifacts in task hub; Medusa workflow/module patterns.
- **Dependencies:** None.
- **Acceptance Criteria:**
  - Chef event model includes dedicated derived menu id field (for example `eventMenuId` naming aligned to codebase conventions).
  - Existing template pointer remains separate.
  - Admin DTO exposes new field for retrieval.
- **Testing Criteria:**
  - Integration test validates persisted derived menu id on create/update flows where applicable.
  - Serialization test confirms admin response includes new field when present.
- **Validation Plan:** Run module-level/integration tests for chef-event retrieval/update routes.

#### Task 2: Implement Create-or-Get Event Menu Derivation Workflow + Admin API
- **Objective:** Add deterministic backend flow that returns existing derived menu or creates one from template via duplication and links it to event.
- **Impacted Modules/Files:**
  - `apps/medusa/src/workflows/` (new `create-or-get-event-menu` workflow)
  - `apps/medusa/src/api/admin/chef-events/[id]/` (new route, e.g., `derive-menu/route.ts`)
  - `apps/medusa/src/modules/menu/service.ts` (reuse, no behavior regression)
  - `apps/medusa/src/modules/chef-event/service.ts` (if helper methods are needed)
- **References:** `duplicate-menu` workflow + Medusa docs references from research packet.
- **Dependencies:** Task 1.
- **Acceptance Criteria:**
  - Endpoint creates derived draft menu only on first invocation for event.
  - Repeated invocation returns existing derived menu and does not create another.
  - Template reference lock rule is enforced after derivation.
  - Pricing rows are copied exactly from template at derivation time (via duplication primitive).
- **Testing Criteria:**
  - API integration test: first call creates + links derived menu.
  - API integration test: second call reuses existing derived menu id.
  - Regression test: source template menu content remains unchanged.
- **Validation Plan:** Run API integration suite for admin chef-event derivation route and duplication interactions.

#### Task 3: Wire Admin SDK/Hooks for Event Menu Derivation Action
- **Objective:** Expose the new derivation endpoint through admin SDK and react-query hooks for admin route consumption.
- **Impacted Modules/Files:**
  - `apps/medusa/src/sdk/admin/admin-chef-events.ts`
  - `apps/medusa/src/admin/hooks/chef-events.ts`
  - `apps/medusa/src/admin/routes/chef-events/[id]/page.tsx`
  - `apps/medusa/src/admin/routes/chef-events/components/menu-details.tsx`
- **References:** Existing admin menus duplication mutation pattern in hooks.
- **Dependencies:** Task 2.
- **Acceptance Criteria:**
  - SDK has method to call event menu derivation endpoint.
  - Hook mutation exists and invalidates relevant chef-event/menu queries.
  - Event detail UI invokes derivation action and routes user to derived menu editor.
- **Testing Criteria:**
  - Hook-level unit test for mutation function + cache invalidation behavior.
  - UI component test for action visibility/state transitions.
- **Validation Plan:** Run admin component/unit tests for chef-event menu detail area.

#### Task 4: Enforce Event Context UX Guardrails
- **Objective:** Clearly separate template viewing from event menu editing and avoid accidental template edits from event context.
- **Impacted Modules/Files:**
  - `apps/medusa/src/admin/routes/chef-events/components/menu-details.tsx`
  - `apps/medusa/src/admin/routes/chef-events/[id]/page.tsx`
  - `apps/medusa/src/admin/routes/menus/[id]/page.tsx` (optional contextual warning if entering template from event link context)
- **References:** Clarification decisions (template lock, default draft behavior).
- **Dependencies:** Task 3.
- **Acceptance Criteria:**
  - Event page presents explicit action labels (e.g., “Customize Menu for Event” / “Edit Event Menu”).
  - Template remains viewable as reference but not the editing target for event customization.
  - UI reflects when derived menu already exists.
- **Testing Criteria:**
  - UI test verifies correct action shown pre- and post-derivation.
  - UI test verifies navigation target is derived menu id, not template id.
- **Validation Plan:** Run admin route/component tests around event menu panel behavior.

#### Task 5: Add Regression Coverage for Lifecycle and Lineage Rules
- **Objective:** Ensure enduring confidence that derived menus preserve lifecycle defaults and template immutability.
- **Impacted Modules/Files:**
  - `apps/medusa/src/api/admin/chef-events/**/__tests__/*`
  - `apps/medusa/src/workflows/**/__tests__/*`
  - Existing menu/chef-event integration test suites
- **References:** `.cursor/rules/testing-patterns-unit.mdc`, `.cursor/rules/testing-patterns-integration.mdc`.
- **Dependencies:** Tasks 1-4.
- **Acceptance Criteria:**
  - Tests cover derivation idempotency, template lock, pricing copy behavior, and draft default behavior.
  - No regressions in menu listing/editing flows.
- **Testing Criteria:**
  - Integration tests for API/workflow interactions.
  - Unit tests for branch logic (derive vs reuse).
- **Validation Plan:** Execute relevant Medusa test suites and ensure green status for new and impacted test files.

### Implementation Guidance
- **From `.devagent/AGENTS.md` → Standard Workflow Instructions / Scope:**
  - `create-plan` is documentation-only; no source-code changes in this workflow.
  - Date and metadata must be explicit (`date +%Y-%m-%d`, `git config user.name`) when maintaining task artifacts.
- **From `.devagent/workspace/memory/constitution.md` → C1 Mission-first delivery:**
  - Implementation tasks must trace to mission and roadmap; avoid unrelated scope expansion.
- **From `.devagent/workspace/memory/constitution.md` → C2 Quality and maintainability:**
  - Follow project rules/conventions and keep validation embedded in implementation tasks.
- **From `.cursor/rules/testing-patterns-unit.mdc`:**
  - Prefer AAA structure, behavior-focused tests, isolated units with explicit mocking where needed.
- **From `.cursor/rules/testing-patterns-integration.mdc`:**
  - Validate realistic route/workflow/data interactions with clear setup/cleanup and deterministic assertions.

---

## Risks & Open Questions

| Item | Type (Risk / Question) | Owner | Mitigation / Next Step | Due |
| --- | --- | --- | --- | --- |
| Existing events have only template pointer and no derived pointer | Risk | PabloJVelez | Implement first-derive path to backfill linkage lazily per event; add integration coverage | Before implementation merge |
| UI confusion between template and event menu entry points | Risk | PabloJVelez | Add explicit labels and conditional CTA states in event menu panel | Before implementation merge |
| Naming decision for new chef-event derived menu field | Question | PabloJVelez | Select canonical naming (`event_menu_id` vs equivalent) at implementation start and apply consistently | Task 1 start |
| Whether to add explicit menu metadata lineage fields now | Question | PabloJVelez | Defer unless needed for debugging/audit; keep as post-MVP enhancement | Post-implementation review |

---

## Progress Tracking
Refer to `.devagent/workspace/tasks/active/2026-04-26_event-menu-template-derivation/AGENTS.md` for progress and decision updates during implementation.

---

## Appendices & References
- Task hub: `.devagent/workspace/tasks/active/2026-04-26_event-menu-template-derivation/AGENTS.md`
- Research packet: `.devagent/workspace/tasks/active/2026-04-26_event-menu-template-derivation/research/2026-04-26_event-menu-template-derivation-research.md`
- Clarification packet: `.devagent/workspace/tasks/active/2026-04-26_event-menu-template-derivation/clarification/2026-04-26_initial-clarification.md`
- Product mission: `.devagent/workspace/product/mission.md`
- Product roadmap: `.devagent/workspace/product/roadmap.md`
- Constitution: `.devagent/workspace/memory/constitution.md`
- Testing conventions: `.cursor/rules/testing-patterns-unit.mdc`, `.cursor/rules/testing-patterns-integration.mdc`
