# Research: Menu Publishing Status Parity with Medusa Products

- Mode: Task
- Requested By: PabloJVelez
- Last Updated: 2026-04-26
- Related Plan: [NEEDS CLARIFICATION: plan artifact not created yet]
- Related Task Plan (Optional): [NEEDS CLARIFICATION]
- Storage Path: `.devagent/workspace/tasks/active/2026-04-26_refactor-menu-publishing-statuses/research/2026-04-26_menu-status-parity-research.md`
- Stakeholders: PabloJVelez (Owner)
- Notes: Focused on status-driven storefront visibility for menus, mirroring Medusa product behavior.

## Request Overview
Investigate how to refactor menu publication so menus are not auto-published on creation, and instead use Medusa-like statuses to control whether a menu is visible on storefront routes. The desired outcome is parity with core product status semantics and a clear implementation direction for backend/admin/store APIs.

## Classification & Assumptions
- Classification: Implementation design research (task-scoped).
- Inferred Problem Statement: Define a status model and route/service behavior for menus that reuses Medusa product-style statuses (`draft`, `proposed`, `published`, `rejected`) so storefront exposure is controlled by status rather than implicit auto-publish behavior.
- Assumptions:
  - [INFERRED] This research applies to `.devagent/workspace/tasks/active/2026-04-26_refactor-menu-publishing-statuses/`.
  - [INFERRED] Current custom menu module has no status field and all menus are currently eligible for store retrieval.
  - [INFERRED] "Reuse the same statuses that products use" means both value set parity and storefront gating semantics.
  - [NEEDS CLARIFICATION] Whether `proposed` and `rejected` must be selectable in admin UI for v1, or only supported in backend/domain model.

## Research Plan (What Was Validated)
1. Validate current menu data model and APIs to identify all touchpoints affected by status introduction.
2. Validate existing workflow behavior for menu create/update/delete to identify where defaults and transitions should occur.
3. Validate Medusa product status value set and expected storefront visibility semantics.
4. Identify migration and compatibility considerations for existing menu records.
5. Define implementation implications and sequencing for `devagent create-plan`.

## Research Questions
| ID | Question | Status (Planned / Answered / Follow-up) | Notes |
| --- | --- | --- | --- |
| RQ1 | Where is menu visibility currently controlled? | Answered | Store menu routes return menus without status filtering. |
| RQ2 | What exact statuses should be reused from Medusa products? | Answered | `draft`, `proposed`, `published`, `rejected`. |
| RQ3 | Which internal components must change for status parity? | Answered | Menu model, migrations, admin create/update schema, store listing/detail queries, and workflow inputs. |
| RQ4 | What should happen to existing menus after introducing status? | Follow-up | Requires migration default decision; recommended `published` for back-compat. |

## Key Findings
- Current `menu` model has no `status` column, so no domain-level publication control exists.
- Storefront menu endpoints currently query menus without any status predicate, so all menus can surface.
- Admin menu create/update schemas currently do not accept or enforce status values.
- Medusa product status type is `draft | proposed | published | rejected`; this is the correct parity target.
- Existing seed/product code in repo already uses `ProductStatus.PUBLISHED`, which aligns with status-parity intent.

## Detailed Findings
### RQ1 — Current menu visibility controls
- Summary answer: Visibility is effectively uncontrolled by publication status in the custom menu module.
- Supporting evidence:
  - Menu model fields include `name`, `courses`, `images`, `menu_experience_prices`, `thumbnail`, and `allow_tbd_pricing`; no `status` field exists.
  - Store menu list endpoint calls `menuModuleService.listAndCountMenus` with search-only filters; no status condition.
  - Store menu detail endpoint calls `menuModuleService.retrieveMenu(id)` directly; no published-only gate.
- Freshness notes: Verified against repository source on 2026-04-26.

### RQ2 — Product status parity target
- Summary answer: Reuse Medusa product statuses exactly: `draft`, `proposed`, `published`, `rejected`.
- Supporting evidence:
  - Medusa types define `ProductStatus` as `"draft" | "proposed" | "published" | "rejected"`.
  - Repo seed logic uses `ProductStatus.PUBLISHED` for product creation in experience seed flows.
- Freshness notes: Medusa type reference and repo source both checked on 2026-04-26.

### RQ3 — Internal implementation touchpoints
- Summary answer: Status parity requires coordinated schema + API + workflow updates.
- Supporting evidence:
  - `create-menu` workflow currently creates menus with only `name`, implying a default status must be set when field is added.
  - Admin menu POST/UPDATE validation schemas currently omit `status`.
  - Store menu queries are performed in custom routes and can be updated locally to enforce `status: "published"`.
- Freshness notes: Verified from repository files on 2026-04-26.

### RQ4 — Existing data compatibility
- Summary answer: A migration strategy is needed to prevent existing menus from disappearing unexpectedly.
- Supporting evidence:
  - There are existing menu migrations and active menu endpoints; adding a non-null status requires backfill/default.
  - If default is `draft` for legacy rows, existing storefront menus could vanish post-migration.
- Freshness notes: Inferred from current schema shape and API behavior as of 2026-04-26.

## Comparative / Alternatives Analysis
### Option A — Full product status parity (recommended)
- Add `status` to `menu` model with allowed values `draft/proposed/published/rejected`.
- Store routes return only published menus by default.
- Admin routes can set/update status and optionally filter by status.
- Tradeoff: Slightly larger change surface now, but clean conceptual parity and future flexibility.

### Option B — Minimal boolean publish flag
- Add `is_published` boolean and gate store routes.
- Tradeoff: Faster initial change but diverges from Medusa conventions and user request; likely requires later migration to richer statuses.

### Option C — Partial parity (status field but only draft/published used)
- Keep full enum domain for compatibility, but v1 UX exposes only draft/published transitions.
- Tradeoff: Good incremental rollout; requires explicit docs to avoid ambiguity around hidden statuses.

## Implications for Implementation
- Model/migration:
  - Add `status` field to `Menu` model with enum-compatible string values.
  - Add migration to create/backfill status for existing records.
- Admin API:
  - Extend create/update schemas to accept status.
  - Decide whether default create status is `draft` (product-like) or `published` for temporary backward compatibility.
- Store API:
  - Filter list endpoint to `status = "published"` unless explicitly overridden for internal use.
  - Guard detail endpoint to return not-found for non-published statuses in store context.
- Workflows:
  - `create-menu` should set explicit default status.
  - `update-menu` should support status transitions.
- Testing:
  - Add integration tests for status transitions and storefront visibility behavior.

## Recommendation
Adopt Option A (full product-status parity) with a compatibility-safe rollout:
1. Introduce `status` on menu records using the same values as Medusa products.
2. Backfill existing menus to `published` in migration to avoid sudden storefront regressions.
3. Set new menu default to `draft` after migration (or behind a temporary feature flag) so new content is reviewable before publication.
4. Enforce `published`-only visibility on store menu routes.
5. Expose status in admin create/update APIs and later in admin UI controls.

## Repo Next Steps (Checklist)
- [ ] Confirm status rollout strategy: immediate `draft` default for new menus vs transitional compatibility window.
- [ ] Define menu status type/constants to avoid string drift and align with Medusa naming.
- [ ] Draft migration plan for existing rows and rollback behavior.
- [ ] Define API contract changes for admin menu create/update and optional list filtering.
- [ ] Define store route behavior for non-published menu IDs (404 vs 403 decision).
- [ ] Run `devagent create-plan` to produce phased implementation tasks and acceptance criteria.

## Risks & Open Questions
| Item | Type (Risk / Question) | Owner | Mitigation / Next Step | Due |
| --- | --- | --- | --- | --- |
| Existing menus disappearing after migration if default/backfill is incorrect | Risk | Implementation owner | Backfill legacy menus to `published`; verify with migration test data | Before implementation |
| Whether `proposed` and `rejected` should be exposed in v1 admin UX | Question | Product owner | Clarify scope in planning; can support in API first | During planning |
| Store detail route behavior for unpublished menus | Question | Implementation owner | Decide and standardize API response contract | During planning |
| Cross-module references that assume all menus are public | Risk | Implementation owner | Search for store menu consumers and test impacted flows | During implementation planning |

## Recommended Follow-ups
- Run `devagent create-plan` to break this into migration/API/workflow/testing phases.
- Add a short clarification packet if status transition policy (who can publish/reject and when) is still undecided.
- Cross-link this research from the task hub `AGENTS.md` references once planning starts.

## Sources
| Reference | Type | Freshness | Access Notes |
| --- | --- | --- | --- |
| `.devagent/workspace/tasks/active/2026-04-26_refactor-menu-publishing-statuses/AGENTS.md` | Internal task context | 2026-04-26 | Active task summary and goals |
| `apps/medusa/src/modules/menu/models/menu.ts` | Internal code | 2026-04-26 | Confirms no status field currently |
| `apps/medusa/src/api/store/menus/route.ts` | Internal code | 2026-04-26 | Confirms no status filtering on list route |
| `apps/medusa/src/api/store/menus/[id]/route.ts` | Internal code | 2026-04-26 | Confirms no status guard on detail route |
| `apps/medusa/src/api/admin/menus/route.ts` and `apps/medusa/src/api/admin/menus/[id]/route.ts` | Internal code | 2026-04-26 | Confirms admin schemas currently omit status |
| `apps/medusa/src/workflows/create-menu.ts` and `apps/medusa/src/workflows/update-menu.ts` | Internal code | 2026-04-26 | Confirms workflow touchpoints for status defaults/transitions |
| `apps/medusa/src/scripts/seed/chef-experiences.ts` | Internal code | 2026-04-26 | Uses `ProductStatus.PUBLISHED` in product seed flow |
| [https://docs.medusajs.com/resources/references/utils/ProductUtils/enums/utils.ProductUtils.ProductStatus](https://docs.medusajs.com/resources/references/utils/ProductUtils/enums/utils.ProductUtils.ProductStatus) | External Medusa docs | 2026-04-26 | Product status enum reference |
| [https://github.com/medusajs/medusa/blob/develop/packages/core/types/src/product/common.ts](https://github.com/medusajs/medusa/blob/develop/packages/core/types/src/product/common.ts) | External Medusa source | 2026-04-26 | `ProductStatus` type union definition |
