# Clarification Packet: Refactor Menu Publishing Statuses

- Mode: Task Clarification
- Requested By: PabloJVelez
- Last Updated: 2026-04-26
- Task Hub: `.devagent/workspace/tasks/completed/2026-04-26_refactor-menu-publishing-statuses/`
- Scope: Gap-filling for plan readiness
- Stakeholders / Decision Makers: PabloJVelez (requestor and decision maker)

## Inferred Task Concept
Refactor menu publication behavior so menus are not automatically visible on the storefront at creation time, and instead use the same status model used by Medusa products to control menu visibility and lifecycle.

## Assumptions
- [INFERRED] Menu status should reuse Medusa product values unless stakeholder chooses a custom status model.
- [INFERRED] Storefront routes should only return `published` menus by default.
- [INFERRED] Existing menu records need migration/backfill to avoid unintentional storefront regressions.

## What Is Already Clarified
- Existing menu model does not currently include `status`.
- Admin menu routes/workflows do not currently carry status transitions.
- Store menu routes currently do not filter by publication status.
- Main open requirement gaps are transition policy and rollout behavior.

## Question Tracker
| ID | Question | Status | Notes |
| --- | --- | --- | --- |
| Q1 | For v1, should admin users be able to set all four statuses (`draft/proposed/published/rejected`) or only `draft/published`? | ✅ answered | Stakeholder chose custom set: `draft`, `active`, `inactive`. |
| Q2 | What default should apply for **newly created menus** after this change? | ✅ answered | `draft` (option A). |
| Q3 | How should **existing menus** be backfilled in migration? | ✅ answered | Backfill all existing menus to `published` semantics (option A from prior question set). |
| Q4 | Confirm final canonical status set and any mapping strategy to product statuses | ✅ answered | Final status model is custom: `draft`, `active`, `inactive`; no Medusa status mapping. |
| Q5 | Define storefront behavior for `inactive` menus | ✅ answered | Only `active` menus are visible on storefront. |
| Q6 | Clarify if status requirement changed from product parity to custom lifecycle | ✅ answered | Requirement changed to custom lifecycle model. |
| Q7 | Confirm migration target label for existing visible menus under new status model | ✅ answered | Backfill existing visible menus to `active` (A). |
| Q8 | Define storefront behavior for unknown/new statuses introduced later | ✅ answered | Hide by default; storefront allowlist is exact `active` (A). |
| Q9 | Define minimal validation rules for non-enum status strings in admin APIs | ✅ answered | Validate against current allowlist `draft|active|inactive` for now, with future extension path (B). |

## Clarification Session Log
- [2026-04-26] Session started with inferred context from task and research artifacts. First question batch prepared.
- [2026-04-26] Stakeholder answers captured:
  - Q1: "draft, active, inactive"
  - Q2: A (`draft` default for new menus)
  - Q3: A (backfill existing menus to published/visible state)
- [2026-04-26] Follow-up answers captured:
  - Q4: A (keep custom statuses)
  - Q5: A (storefront shows `active` only)
  - Q6: D + note (no internal mapping; avoid enum to support future statuses)
- [2026-04-26] Final answers captured:
  - Q7: A (backfill existing visible menus to `active`)
  - Q8: A (hide unknown/future statuses on storefront by default)
  - Q9: B (admin API only accepts `draft|active|inactive` for now)

## Gaps Requiring Research
- None currently; technical implementation unknowns can be handled in planning unless evidence conflicts emerge.

## Plan Readiness
- Current status: Ready
- Blocking gaps: None
- Rationale: Core lifecycle, default status, migration backfill, store visibility behavior, and API validation constraints are all explicitly decided.

## Clarified Requirements
### Scope & End Goal
- Introduce menu status lifecycle using custom string statuses: `draft`, `active`, `inactive`.
- Replace auto-publish behavior with status-driven storefront visibility.
- Keep status as non-enum at persistence level to allow future status expansion.

### Technical Constraints & Requirements
- New menu default status is `draft`.
- Existing currently visible menus must be backfilled to `active`.
- Storefront routes must expose only `active` menus.
- Unknown/new statuses must be hidden on storefront unless explicitly allowlisted later.
- Admin/API input validation must allow only `draft|active|inactive` for now.

### Dependencies & Blockers
- Requires menu model update and migration for status column + backfill.
- Requires admin API schema updates for status create/update.
- Requires store route filtering updates for list/detail behavior.
- No external stakeholder blocker currently identified.

### Implementation Approach (Requirement-Level)
- Use a centralized status constant/allowlist (not DB enum) as current contract.
- Apply strict allowlist validation at API boundary while storing as string.
- Enforce storefront allowlist (`active` only) to prevent accidental exposure.

### Acceptance Criteria & Verification
- Creating a menu without explicit status results in `draft`.
- Migrated legacy visible menus appear as `active`.
- Store menu endpoints return only `active` menus.
- Menus with `draft`, `inactive`, or unknown statuses are not visible in store routes.
- Admin create/update rejects statuses outside current allowlist.

## Assumptions Log
| Assumption | Owner | Validation Required | Validation Method |
| --- | --- | --- | --- |
| Future statuses may be added later | PabloJVelez | No | Captured explicit stakeholder decision |
| Current v1 status allowlist remains `draft|active|inactive` | PabloJVelez | No | Captured explicit stakeholder decision |
| Existing menus currently intended to remain publicly visible | PabloJVelez | No | Captured explicit stakeholder decision (backfill to `active`) |

## Change Log
- [2026-04-26] Created initial clarification packet with inferred concept, assumptions, and first tracked question set.
- [2026-04-26] Updated packet with stakeholder responses for Q1-Q3 and identified follow-up gaps (Q4-Q6).
- [2026-04-26] Updated packet with stakeholder responses for Q4-Q6 and added final gap checks (Q7-Q9).
- [2026-04-26] Completed clarification with Q7-Q9 resolved; marked packet plan-ready and added requirements/acceptance criteria.
