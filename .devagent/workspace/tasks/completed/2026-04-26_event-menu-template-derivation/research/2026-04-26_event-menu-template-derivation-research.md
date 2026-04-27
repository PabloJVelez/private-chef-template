# Event Menu Template Derivation Research

## Classification & Assumptions
- Classification: Implementation design research (admin event/menu workflow behavior and data modeling).
- Inferred Problem Statement: Enable chefs to customize a menu from an event without mutating the original template by creating an event-specific draft derivative, while keeping template editing restricted to the admin menus page.
- Assumptions:
  - [INFERRED] This research run is for task `.devagent/workspace/tasks/completed/2026-04-26_event-menu-template-derivation/`.
  - [INFERRED] Event-specific menu customization should be initiated from the chef-event detail/edit experience.
  - [INFERRED] Existing menu lifecycle (`draft` / `active` / `inactive`) should remain authoritative for storefront visibility.
  - [INFERRED] Existing menu duplication behavior is acceptable as a base primitive if association semantics are added for chef events.

## Research Plan (What Was Validated)
1. Validate how chef events currently reference menus and whether event-specific menu identity exists.
2. Validate current menu lifecycle behavior and whether duplication defaults to draft.
3. Validate whether admin already has reusable duplication primitives in API/workflows/services.
4. Validate UI touchpoints where event-level menu edit actions can be introduced safely.
5. Validate Medusa-recommended patterns for module service usage, workflow orchestration, and route/workflow interaction.

## Findings & Tradeoffs

### 1) Current event model only stores a template menu pointer, not a derived menu pointer
- `ChefEvent` currently has `templateProductId` and no dedicated field for an event-owned menu id, which means any edit path that points directly to the template menu risks mutating shared data.
- Evidence:
  - `apps/medusa/src/modules/chef-event/models/chef-event.ts` (has `templateProductId`, no `eventMenuId`/equivalent)
  - `apps/medusa/src/admin/routes/chef-events/components/chef-event-form.tsx` (select label is "Menu Template", stores `templateProductId`)
  - `apps/medusa/src/admin/routes/chef-events/components/menu-details.tsx` (renders and links template menu via `templateProductId`)
- Tradeoff: Reusing `templateProductId` for derived menus is fast but blurs source-of-truth semantics; adding a dedicated event-menu reference is slightly more work but prevents data ambiguity and accidental template edits.

### 2) Menu status model already supports a safe "draft-first" derivation flow
- Menu defaults to `draft`, and storefront visibility is explicitly constrained to `active`, which aligns with the requirement that derived menus should not auto-publish.
- Evidence:
  - `apps/medusa/src/modules/menu/constants.ts` (`DEFAULT_MENU_STATUS = "draft"`, storefront-visible statuses include only `"active"`)
  - `apps/medusa/src/modules/menu/models/menu.ts` (`status` defaults to draft)
  - `apps/medusa/src/modules/menu/migrations/Migration20260426100000_add_menu_status.ts` (backfilled old menus to active for parity; new records default draft)
- Tradeoff: Leaving lifecycle unchanged minimizes risk; however, acceptance criteria must explicitly enforce that event-derived menus remain draft unless intentionally promoted.

### 3) Duplication primitives already exist and are close to requirements
- The codebase already has:
  - `duplicateMenu` in menu module service (deep copy of nested courses/dishes/ingredients/images/pricing)
  - `duplicate-menu-workflow`
  - `/admin/menus/:id/duplicate` route
  - admin mutation hooks and UI actions for duplication
- Evidence:
  - `apps/medusa/src/modules/menu/service.ts` (`duplicateMenu`)
  - `apps/medusa/src/workflows/duplicate-menu.ts`
  - `apps/medusa/src/api/admin/menus/[id]/duplicate/route.ts`
  - `apps/medusa/src/admin/hooks/menus.ts` (`useAdminDuplicateMenuMutation`)
- Tradeoff: Reusing this primitive avoids duplicating business logic. The missing part is orchestration with chef events (duplicate + persist event association + UX routing).

### 4) Chef-event admin page currently exposes template menu details only
- Event details page renders `MenuDetails` from template id and provides a `View Menu` link to `/menus/:id`, which currently targets template editing in the generic menu editor.
- Evidence:
  - `apps/medusa/src/admin/routes/chef-events/[id]/page.tsx` (`<MenuDetails templateProductId=... />`)
  - `apps/medusa/src/admin/routes/chef-events/components/menu-details.tsx` (button routes to `/menus/${menu.id}`)
- Tradeoff: Keeping direct navigation to template menus is useful for read-only inspection, but an explicit "Customize for Event" action is needed to create/open event-specific drafts and avoid accidental template edits.

### 5) Medusa docs support workflow-first orchestration for cross-module logic
- Official guidance favors implementing business flows in workflows, resolving module services in steps, and invoking workflows from API routes.
- Evidence (official docs via Medusa MCP):
  - Framework overview and workflows/modules patterns: <https://docs.medusajs.com/learn/fundamentals/framework>
  - Modules + workflow execution from routes: <https://docs.medusajs.com/learn/fundamentals/modules#test-the-module>
  - Module isolation recommends cross-module integration in workflows: <https://docs.medusajs.com/learn/fundamentals/modules/isolation#how-to-use-services-of-other-modules>
  - Admin route validation and workflow execution examples: <https://docs.medusajs.com/resources/examples#add-validation-for-custom-routes>
- Tradeoff: Workflow-based implementation is slightly more upfront structure but is consistent with existing project architecture and safer for transactional multi-step actions.

## Recommendation
Adopt a two-pointer model on chef events and a dedicated event-menu orchestration flow:

1. Keep `templateProductId` as immutable source-template reference.
2. Add a separate chef-event field for the derived/editable menu id (for example `eventMenuId`).
3. Introduce an admin endpoint/workflow for "customize menu for event":
   - If `eventMenuId` is missing: duplicate from template using existing `duplicateMenu`, save new id to event, return derived menu.
   - If `eventMenuId` exists: return existing derived menu.
4. Update event detail UI to:
   - Show template reference (read-only context).
   - Add explicit "Customize Menu" / "Edit Event Menu" action targeting the derived menu path.
5. Preserve menu lifecycle defaults so derived menus remain draft until explicitly activated.

This approach directly satisfies the requirement ("event edits should not alter template menus") while reusing existing duplication behavior and aligning with Medusa workflow patterns.

## Repo Next Steps (Checklist)
- [ ] Add a chef-event data field for event-owned menu reference (separate from `templateProductId`).
- [ ] Implement workflow + admin route to "create-or-get event menu draft from template".
- [ ] Extend admin SDK/hooks for the new chef-event menu action.
- [ ] Update chef-event detail UI (`menu-details`) to use explicit event-menu customization actions.
- [ ] Add guardrails in UX copy/labels to distinguish template vs event menu.
- [ ] Add tests:
  - [ ] Duplication preserves template immutability.
  - [ ] First customize action creates derived draft and links event.
  - [ ] Repeated customize/edit action reuses existing derived menu.
  - [ ] Storefront visibility remains unchanged unless status becomes active.

## Risks & Open Questions
- Risk: Existing events with only `templateProductId` may need migration/backfill behavior for first customization action.
- Risk: Operators might still navigate to `/menus/:id` and edit templates directly unless UI wording/action placement is clear.
- Open Question: Should `templateProductId` remain editable after an event menu is derived, or become locked to preserve lineage?
- Open Question: Should event-level menu derivation copy pricing matrix as-is, or allow pricing divergence rules at event level?
- Open Question: Do we need audit metadata (`derived_from_menu_id`, `derived_for_chef_event_id`) on menu records for traceability?

## Sources
- Internal: `.devagent/workspace/tasks/completed/2026-04-26_event-menu-template-derivation/AGENTS.md` (freshness: 2026-04-26)
- Internal: `apps/medusa/src/modules/chef-event/models/chef-event.ts` (freshness: 2026-04-26)
- Internal: `apps/medusa/src/modules/menu/service.ts` (freshness: 2026-04-26)
- Internal: `apps/medusa/src/workflows/duplicate-menu.ts` (freshness: 2026-04-26)
- Internal: `apps/medusa/src/admin/routes/chef-events/components/menu-details.tsx` (freshness: 2026-04-26)
- Internal: `apps/medusa/src/modules/menu/constants.ts` (freshness: 2026-04-26)
- External (Medusa docs): <https://docs.medusajs.com/learn/fundamentals/framework> (accessed: 2026-04-26)
- External (Medusa docs): <https://docs.medusajs.com/learn/fundamentals/modules#test-the-module> (accessed: 2026-04-26)
- External (Medusa docs): <https://docs.medusajs.com/learn/fundamentals/modules/isolation#how-to-use-services-of-other-modules> (accessed: 2026-04-26)
- External (Medusa docs): <https://docs.medusajs.com/resources/examples#add-validation-for-custom-routes> (accessed: 2026-04-26)
