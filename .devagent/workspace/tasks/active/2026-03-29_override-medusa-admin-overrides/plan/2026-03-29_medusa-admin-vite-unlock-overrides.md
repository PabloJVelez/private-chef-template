# Medusa Admin Overrides via `@unlockable/vite-plugin-unlock` Plan

- Owner: PabloJVelez
- Last Updated: 2026-03-29
- Status: Draft
- Related Task Hub: `.devagent/workspace/tasks/active/2026-03-29_override-medusa-admin-overrides/`
- Stakeholders: PabloJVelez (DRI)
- Notes: Clarified requirements in `clarification/2026-03-29_initial-clarification.md`. Research in `research/2026-03-29_medusa-admin-overrides-with-vite-plugin-unlock.md`.

---

## PART 1: PRODUCT CONTEXT

### Summary

Private Chef needs small, branded touches on Medusa Admin—sign-in copy, browser tab title, a chef-hat mark instead of the default avatar on login, and a clearer Orders list column label—**without** forking `@medusajs/dashboard`. This plan uses [`@unlockable/vite-plugin-unlock`](https://github.com/unlockablejs/vite-plugin-unlock) with its Medusa preset so Vite resolves a few basename-matched override files from `apps/medusa/src/admin/overrides/` while the real dashboard package stays a normal dependency.

### Context & Problem

- **Current state:** Admin uses stock `@medusajs/dashboard` UI: generic welcome copy, default login graphic, generic “Fulfillment” column header on the orders table.
- **Pain:** Operators and stakeholders see Medusa-default chrome; “Fulfillment” is ambiguous for an event-ticket product model.
- **Trigger:** Task hub + clarification session locked scope to plugin wiring plus **only** these UI changes; further admin branding is explicitly out of scope for this iteration.

**Evidence / artifacts**

- Clarification packet: `clarification/2026-03-29_initial-clarification.md`
- Research packet: `research/2026-03-29_medusa-admin-overrides-with-vite-plugin-unlock.md`

### Objectives & Success Metrics

| Objective | Baseline | Target | How we know |
| --- | --- | --- | --- |
| Branded sign-in | “Welcome to Medusa” (i18n `login.title`) | Heading: **Welcome to Private Chef's Admin** | Visible on `/login` |
| Branded sign-in subtitle | i18n `login.hint` | Private Chef–specific subtitle (exact string: see Risks) | Visible under heading |
| Tab title | Generic / Medusa default | Private Chef–specific tab title | Browser tab on `/login` |
| Login mark | `AvatarBox` default | Chef-hat graphic | Visible above heading |
| Orders list column | “Fulfillment” (i18n `fields.fulfillment`) | **Fulfillment for Event** | Orders list grid header only |

### Users & Insights

- **Primary users:** Internal admins (operators) signing into Medusa Admin and scanning the Orders list.
- **Insight:** Scope is intentionally narrow (clarification Q3 = strict two feature areas + plugin) to preserve upgrade safety.

### Solution Principles

- **Minimal surface:** Prefer overriding the smallest number of dashboard files; do not change auth or data-fetching behavior.
- **Orders list only:** Do **not** override shared header components used elsewhere if that would change the customer-detail orders table; scope is the main **Orders list** view only.
- **Upstream-safe:** Prefer copying upstream `login.tsx` / `order-list-table.tsx` patterns and adjusting only presentation (strings, logo, column header mapping).
- **Typed, boring code:** Match existing Medusa/TS style; avoid `any` unless matching upstream patterns.

### Scope Definition

- **In scope**
  - Add dev dependency `@unlockable/vite-plugin-unlock`.
  - Extend `apps/medusa/medusa-config.ts` `admin` config with `vite: () => ({ plugins: [unlock(medusa())] })` (optionally `debug: true` during rollout).
  - Create `apps/medusa/src/admin/overrides/` with:
    - `login.tsx` — branded heading, subtitle, tab title, chef-hat image; same form + navigation behavior as upstream.
    - `order-list-table.tsx` — same data/query/table behavior as upstream; fulfillment column header shows **Fulfillment for Event** (only for this table instance).
  - Static asset for chef hat (e.g. SVG under `apps/medusa/src/admin/assets/` or co-located import path that Vite resolves).
- **Out of scope / future**
  - Sidebar/menu copy (“Medusa Store”), other routes, i18n locale file overrides, customer-detail order subsection table, global override of `use-order-table-columns.tsx` or `fulfillment-status-cell.tsx` (would affect customer detail—**avoid** per clarification).
  - Automated visual regression tests (not assumed available).

### Functional Narrative

#### Flow: Admin sign-in (`/login`)

- **Trigger:** User opens admin app, lands on login route.
- **Experience:** User sees chef-hat graphic, **Welcome to Private Chef's Admin**, Private Chef subtitle, correct browser tab title; email/password and continue behavior unchanged.
- **Acceptance criteria:** Successful login still redirects to prior `location.state.from` or default `/orders`; errors still surface as today.

#### Flow: Orders list (`/orders`)

- **Trigger:** Authenticated user views main orders data table.
- **Experience:** Fulfillment status column header reads **Fulfillment for Event**; cell values and sorting unchanged.
- **Acceptance criteria:** Customer detail → order list subsection still shows default “Fulfillment” header (unless product later expands scope).

### Technical Notes & Dependencies

- **Repo entry points:** `apps/medusa/medusa-config.ts` (today: `admin: { disable, backendUrl }` only — Vite plugins not yet wired).
- **Dashboard sources (installed package; verify version in lockfile during impl):**
  - Login UI: `node_modules/@medusajs/dashboard/src/routes/login/login.tsx` (exported as route `Component` via `routes/login/index.ts`).
  - Orders list table: `node_modules/@medusajs/dashboard/src/routes/orders/order-list/components/order-list-table/order-list-table.tsx`.
  - Shared hook `useOrderTableColumns` is used by **both** orders list and `customer-order-section`; therefore **do not** change the hook or `FulfillmentStatusHeader` globally if the goal is orders-list-only header text.
- **Package manager:** `apps/medusa/package.json` uses **yarn 4** (`packageManager: yarn@4.5.0`).

---

## PART 2: IMPLEMENTATION PLAN

### Scope & Assumptions

- **Scope focus:** `apps/medusa` admin Vite pipeline + two dashboard override files + one static logo asset.
- **Key assumptions**
  - Medusa admin build accepts `admin.vite` callback returning extra Vite plugins (per Medusa + plugin docs).
  - Basename overrides `login.tsx` and `order-list-table.tsx` each match **exactly one** dashboard source file (verified in current `@medusajs/dashboard` tree).
- **Out of scope:** Any backend API, storefront, or non-admin app changes.

### Implementation Tasks

#### Task 1: Add `@unlockable/vite-plugin-unlock` and wire Medusa admin Vite

- **Objective:** Install the plugin and enable the Medusa preset so override files under `src/admin/overrides` shadow dashboard modules.
- **Impacted modules/files**
  - `apps/medusa/package.json` — add devDependency (pin to a known stable version, e.g. latest from npm at implement time).
  - `apps/medusa/medusa-config.ts` — import `unlock` and `medusa` from the plugin; extend `admin` with `vite: () => ({ plugins: [unlock(medusa({ overrides: "./src/admin/overrides", debug: process.env.NODE_ENV === "development" }))] })` or equivalent per team preference.
- **References:** [unlockablejs/vite-plugin-unlock README](https://github.com/unlockablejs/vite-plugin-unlock) (Medusa section).
- **Dependencies:** None (first task).
- **Acceptance criteria**
  - `yarn install` succeeds at repo root / Medusa app per workspace conventions.
  - `medusa develop` starts without Vite config errors; with `debug: true` in development, logs show overrides resolving when override files exist.
- **Testing criteria**
  - Run `yarn workspace medusa build` (or project-standard build) and confirm admin client build completes.
- **Validation plan:** Build passes; optional dev smoke: temporarily add a trivial override to confirm resolution, then replace with real overrides in Tasks 2–3.

#### Task 2: Override `login.tsx` (copy, title, chef-hat logo)

- **Objective:** Replace Medusa-default welcome copy and login mark while preserving authentication flow and layout structure from upstream `routes/login/login.tsx`.
- **Impacted modules/files**
  - `apps/medusa/src/admin/overrides/login.tsx` (new) — start from upstream component; **export the same public component** the route expects (`Login` is fine if `routes/login/index.ts` still re-exports; confirm actual export pattern: upstream uses `export { Login as Component } from "./login"` in `index.ts` — lazy import resolves package `routes/login` folder; overriding **`login.tsx`** replaces the implementation file consumed by that `index.ts`).
  - Static asset: e.g. `apps/medusa/src/admin/assets/chef-hat.svg` (or similar) — ensure license/originality is acceptable (custom SVG preferred).
- **References**
  - Upstream: `node_modules/@medusajs/dashboard/src/routes/login/login.tsx`
  - Plugin alias: imports from `~dashboard/...` where needed (per plugin README).
- **Dependencies:** Task 1 complete.
- **Acceptance criteria**
  - Heading text is exactly: **Welcome to Private Chef's Admin**.
  - Subtitle reflects Private Chef (exact approved string — if not provided in backlog, use a neutral default and record it in the task hub decision log; see Risks).
  - Browser tab title on `/login` reflects Private Chef (implement via `document.title` in `useEffect` or another pattern consistent with dashboard stack; `react-helmet-async` is available at the app root but may be unused in routes—prefer the smallest dependency on global providers).
  - `<AvatarBox />` is replaced (or wrapped) so the visible mark is a chef-hat graphic with appropriate `alt` text for accessibility.
  - Login success and error handling behave as upstream.
- **Testing criteria**
  - Manual: load `/app` login, verify strings, tab title, image, and successful sign-in.
- **Validation plan:** Manual check only (no new e2e infrastructure assumed).

#### Task 3: Override `order-list-table.tsx` (Fulfillment header on main list only)

- **Objective:** Change only the **main Orders list** table fulfillment column header to **Fulfillment for Event** without affecting other tables using `useOrderTableColumns`.
- **Impacted modules/files**
  - `apps/medusa/src/admin/overrides/order-list-table.tsx` (new) — copy upstream `order-list-table.tsx`, import `useOrderTableColumns` from the real dashboard (via `~dashboard/.../use-order-table-columns` or a relative path the plugin documents), then adjust the `columns` array so the `fulfillment_status` column’s `header` renders **Fulfillment for Event** (structure may use `ColumnDef` from `@tanstack/react-table`; map immutably).
- **References**
  - Upstream: `node_modules/@medusajs/dashboard/src/routes/orders/order-list/components/order-list-table/order-list-table.tsx`
  - Upstream hook: `node_modules/@medusajs/dashboard/src/hooks/table/columns/use-order-table-columns.tsx`
- **Dependencies:** Task 1 complete.
- **Acceptance criteria**
  - On `/orders`, the fulfillment column header displays **Fulfillment for Event**.
  - Order row navigation, filters, pagination, and cell renderers behave as upstream.
  - Customer detail page order subsection (if exercised) still shows the default Fulfillment label — confirms we did not globally override `FulfillmentStatusHeader` / the shared hook.
- **Testing criteria**
  - Manual: compare `/orders` vs customer → orders subsection header labels.
- **Validation plan:** Manual verification.

### Implementation Guidance

- **Medusa config & modules:** Follow existing patterns in `apps/medusa/medusa-config.ts` (TypeScript, `defineConfig`, env via `loadEnv`). `.cursor/rules/medusa-development.mdc` applies to backend structure and TypeScript discipline.
- **Dashboard overrides:** Match filenames exactly (`login.tsx`, `order-list-table.tsx`). Organize under `apps/medusa/src/admin/overrides/` (nested folders allowed; basename is what matters).
- **Imports from upstream:** Use `~dashboard/...` for original modules when the plugin exposes that alias (per [plugin README](https://github.com/unlockablejs/vite-plugin-unlock)).
- **Accessibility:** Chef-hat mark should have meaningful `alt` text; heading hierarchy should stay coherent with upstream (`Heading` from `@medusajs/ui`).

### Release & Delivery Strategy

- Land behind normal PR review; no feature flags required for copy-only changes.
- After merge, smoke-test **development** and **production** admin builds if CI does not already build admin artifacts.

---

## Risks & Open Questions

| Item | Type | Owner | Mitigation / Next Step | Due |
| --- | --- | --- | --- | --- |
| Subtitle and tab title copy not explicitly provided | Question | PabloJVelez | Approve final strings during implementation (or accept implementer default: e.g. subtitle “Sign in to manage Private Chef.” / title “Private Chef Admin”). | Before PR |
| `@unlockable/vite-plugin-unlock` API drift (early plugin) | Risk | Implementer | Pin version; read changelog; keep overrides minimal. | Implementation |
| Dashboard internal file renames on upgrade | Risk | Implementer | After Medusa upgrades, verify `login.tsx` / `order-list-table.tsx` still exist; run with plugin `debug: true` locally. | Each upgrade |
| Wrong override file (e.g. shared `index.ts`) | Risk | Implementer | Only use basenames verified unique in current dashboard tree (`login.tsx`, `order-list-table.tsx`). | Implementation |

---

## Progress Tracking

Use `.devagent/workspace/tasks/active/2026-03-29_override-medusa-admin-overrides/AGENTS.md` for checklist updates during implementation.

---

## Appendices & References

- Task hub: `AGENTS.md`
- Clarification: `clarification/2026-03-29_initial-clarification.md`
- Research: `research/2026-03-29_medusa-admin-overrides-with-vite-plugin-unlock.md`
- Plugin: [unlockablejs/vite-plugin-unlock](https://github.com/unlockablejs/vite-plugin-unlock)
