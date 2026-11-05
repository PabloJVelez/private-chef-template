# Availability simplification — owner follow-up, 2026-11-05

This replaces the presentation described in [the initial UX refinement](availability-ux-refinement.md). The owner reviewed the running admin and requested one global Availability setting, more recognizable tabs, and substantially less Meal Prep configuration. The owner explicitly chose **remove the method-window and manual work-planning controls from this page, preserving their saved data**.

The full [Requirements Contract v1.1/r4](requirements-v1.1-r4.md) was read again. Shared working hours/time off, event notice rules, independent methods/styles, complete-snapshot saves and version-conflict protections remain applicable. This follow-up changes presentation and field visibility; it does not choose any unresolved delivery, scheduling, pricing or payment policy.

## Revised page

The navigation appears at the top, with three Medusa/Radix tabs: **Availability**, **Private events**, and **Meal Prep**. An active underline and a continuous bottom border distinguish tabs from the old pills. Keyboard arrows, Home/End, focus and linked panels remain provided by the native primitive.

The owner's final follow-up removes the persistent “Availability / All changes saved” bar. When there are no pending changes, the tabs lead the page with no save/discard section. Editing reveals the existing actions; saving keeps them visible and disabled while the request runs. A successful save uses the existing Medusa “Availability saved” toast and hides the bar when no newer edits remain. Discarding or reverting to saved values also hides it. Unfinished editors and failed saves retain their guidance and recovery controls.

- **Availability** is the single home for working hours, timezone, time off and Google Calendar. Its heading says “One schedule for private events and meal prep.” The existing hours editor remains in place. There is no per-service hours editor.
- **Private events** retains advance-notice settings, with a compact Medusa section header and a plain setting row instead of a nested bordered form.
- **Meal Prep** has one divided Medusa settings container. Three switches select in-home cooking, delivery and pickup. A menu-choice row summarizes the selected styles and opens an Edit drawer. Delivery-area editing appears when delivery is selected or when a saved area already exists.
- **Removed from this page:** method weekday/date editors, manual work-plan forms, and the work/order/serving review panel. There is no Advanced area holding those controls. Existing methods' `weekly`/`dates` and all `work_plans` are retained unchanged in every complete save snapshot.
- Menu choices and delivery details use native Medusa Drawer, Switch, Checkbox, Select, Input, Label and Textarea components. These follow the installed dashboard's `store-general-section` pattern: `Container` with `divide-y p-0`, compact `px-6 py-4` rows, summaries and explicit Edit actions. Drawers stage their own fields; Cancel/Escape discard those local edits, Apply merges only that section into the current page draft, and Save availability persists the entire snapshot.

The page still has draft-only Meal Prep status. A service toggle does not activate production scheduling. Stored method-window/work-plan data is preserved for compatibility, not applied as a new policy. The runtime schema, API, database and reservations are unchanged.

## Save and accessibility protections

Tab switches preserve global hours/date editors. An unfinished editor blocks Save and the review action returns keyboard focus to Availability. Opening an editable drawer also blocks page Save and Google connection changes; invalid area inputs cannot be applied. Drawers trap focus and restore it to the invoking Edit button on close. Read-only browsing and opening/canceling a drawer never call the save API.

Drawer edits are isolated by field. A save response arriving while a drawer is open advances the page version without replacing its local input; applying afterward merges against current settings. Discard and conflict reload continue to restore complete snapshots, including removed fields. Reload retains the existing synchronous edit lock. No response metadata is submitted to the strict API.

## Verification and requirement mapping

- **Global Availability / R09:** rendered tests assert a single working-hours editor, navigation before the schedule, shared-hour/notice/service changes saved together, pending global input across tabs, and focus restoration. Existing hours, exceptions, Google and notice regressions remain.
- **Recognizable accessible tabs:** three tabs with linked panels, selected/hidden state, ArrowLeft/Right and Home/End navigation. Medusa handles keyboard semantics; the styling uses Medusa theme tokens.
- **Minimal Meal Prep:** rendered tests assert only three service switches and summary/edit actions, no time/date/work-planning controls, and no Advanced area. Delivery details are a separate drawer, including when the service is off but saved area data exists.
- **Preserve removed settings:** populated method weekday/date maps and work plans survive visible-field edits, save, discard and remount. The real PostgreSQL SDK/HTTP/workflow regression explicitly changes a service flag/menu style and verifies each removed map/plan and the other settings remain intact.
- **Persistence/accessibility:** drawer focus, Escape/Cancel, no implicit form submission, invalid ZIP rejection, whole-page discard, in-flight save completion, stale versions, exclusive reload and complete snapshots are covered.
- **Conditional save bar:** rendered regressions assert no bar on initial load or tab navigation, visible controls after editing, disabled actions while saving, exactly one success toast, and no bar after save/discard/revert/reload. Failed saves and edits made during a request keep the relevant controls visible.

On Node **24.22.2** and Yarn **4.5.0**, a new disposable PostgreSQL **16** container ran the full regression harness: **499 tests passed, none skipped** (288 Medusa unit/rendered, 15 storefront, 192 PostgreSQL integration, 4 legacy migration tests). Both workspace typechecks and backend/admin/storefront production builds passed. Final focused UI/editor checks and the Medusa build were repeated after the last presentation cleanup. Runtime-file ESLint and `git diff --check` passed. Hosted CI at the final pushed SHA is recorded in the PR handoff and uses the repository-pinned Node 24.22.1.

For the final save-bar adjustment, **40 focused UI/editor tests passed, none skipped**, with Medusa typecheck, backend/admin production build, route ESLint and diff checks passing. The full hosted verification passed at the preceding head `109d1fcb9f5f46256f9426819251d7664a3b303e`; the new head triggers the same complete verification, including real PostgreSQL and migration rehearsal. The earlier interactive preview predates this final save-bar adjustment; the walkthrough above describes the current behavior.

No new migration or dependency is introduced. The inherited migration rehearsal still runs in hosted CI; this follow-up's local PostgreSQL evidence includes the existing migration regression suites. No production database, live calendar/payment service, merge or deployment was used.

An interactive, self-contained preview bundles the actual revised components and admin CSS with sample in-memory data. It is a component preview, not authenticated admin E2E. The T3 HTML preview checker reported missing host browser libraries, so no automated visual acceptance is claimed for this pass. Native component interactions are tested through React/JSDOM; the interactive preview is provided for owner inspection.

## ChatGPT → Arbor BTS-3

Publish the updated PR #29 head, exact-head CI state, and this owner follow-up. Preserve the parent branch `feat/meal-prep-v1-fulfillment-validation` at `3a5f809cca11cb37c7f782f6055f27ccaf38a339`; PR #28 and upstream branches remain unchanged. Record that the owner specifically chose to remove method-window/work-plan controls while retaining saved data. All three current requests are implemented; the previous expanded-card presentation is superseded. Contract v1.1/r4's unresolved product/activation gates remain unchanged. No direct Arbor publication is performed by this agent.
