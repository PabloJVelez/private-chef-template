# Medusa Admin Overrides via `@unlockable/vite-plugin-unlock` Plan

- Owner: PabloJVelez
- Last Updated: 2026-03-29
- Status: Active (scope expanded beyond initial clarification; implemented in repo)
- Related Task Hub: `.devagent/workspace/tasks/completed/2026-03-29_override-medusa-admin-overrides/`
- Stakeholders: PabloJVelez (DRI)
- Notes: Original requirements in `clarification/2026-03-29_initial-clarification.md`. Research in `research/2026-03-29_medusa-admin-overrides-with-vite-plugin-unlock.md`. **Authoritative “how we use overrides” doc:** `docs/medusa-admin-unlock-overrides.md`.

---

## PART 1: PRODUCT CONTEXT

### Summary

Private Chef customizes Medusa Admin—branding, navigation, orders UX, and Stripe Connect payout visibility—**without** forking `@medusajs/dashboard`. This plan documents [`@unlockable/vite-plugin-unlock`](https://github.com/unlockablejs/vite-plugin-unlock) with its Medusa preset so Vite resolves basename-matched files under `apps/medusa/src/admin/overrides/` while the dashboard stays a normal dependency.

The **initial** task hub focused on login copy and the orders list “Fulfillment” column. **Current codebase** also includes default landing redirect, sidebar `menu.config.ts`, order detail + summary forks (no fulfillment section on detail, payout block in Summary), shared payout helpers, TypeScript shim for `~dashboard`, and repo docs.

### Context & Problem

- **Original pain:** Generic Medusa chrome; “Fulfillment” ambiguous for event tickets; need branded sign-in.
- **Extended needs:** Default admin home should match product (chef events); sidebar should surface Menus / Chef Events and de-emphasize irrelevant core items; order detail should not emphasize physical fulfillment for digital/event tickets; platform commission and chef take-home should appear in the order Summary when Stripe Connect payments include fee data.

**Evidence / artifacts**

- Clarification packet: `clarification/2026-03-29_initial-clarification.md`
- Research packet: `research/2026-03-29_medusa-admin-overrides-with-vite-plugin-unlock.md`
- Operational guide: `docs/medusa-admin-unlock-overrides.md`

### Objectives & Success Metrics

| Objective | Target | How we know |
| --- | --- | --- |
| Branded sign-in | Heading **Welcome to Private Chef's Admin**, subtitle, tab title, chef-hat (or chosen) mark | `/login` |
| Default landing | Open `/` in admin → lands on **`/chef-events`** (not `/orders`) | Browser |
| Sidebar | **Chef Events** first in configured order; **Menus** present; **Inventory** / **Price Lists** removed; core vs Extensions duplicates handled per plugin rules | Left nav |
| Orders list | Event-oriented column behavior + extended `fields`; optional column exclusions (e.g. sales channel) | `/orders` |
| Order detail | No **Order fulfillment** block in main column; breadcrumbs + order retrieve still work | Order detail URL |
| Summary payout | **Payout** subsection in cost breakdown for Stripe Connect payments (gross, optional Stripe fee row, platform commission, chef take-home) | Order detail Summary card |
| Build | Admin client builds; unlock lists expected overrides in dev | `yarn build` / `medusa develop` |

### Users & Insights

- **Primary users:** Internal operators using Admin for events, menus, orders, and payouts.
- **Insight:** Overrides stay basename-small where possible; large forks (`order-summary-section.tsx`) carry `// @ts-nocheck` and track upstream for upgrades.

### Solution Principles

- **Minimal where possible:** Prefer single-file overrides; use `~dashboard/...` to reuse upstream.
- **Sibling overrides:** When an override imports another overridden module, use a **relative import** (e.g. `./order-summary-section`) so Vite loads **your** fork. Imports from `~dashboard/...` resolve to **original** dashboard sources—so `order-detail.tsx` must not import `OrderSummarySection` from `~dashboard` if the summary is also overridden.
- **Upstream-safe:** Pin `@unlockable/vite-plugin-unlock`; after Medusa bumps, diff the same basenames in `node_modules/@medusajs/dashboard`.
- **Shared logic:** Stripe payout math lives in `apps/medusa/src/lib/order-stripe-payout.ts`; admin UI in `apps/medusa/src/admin/components/order-stripe-payout-breakdown.tsx`.

### Scope Definition

- **In scope (implemented or planned in this task hub)**
  - `apps/medusa/medusa-config.ts` — `admin.vite` registers `unlock(unlockMedusa({ overrides: "./src/admin/overrides", debug: IS_DEV }))`.
  - `apps/medusa/package.json` — devDependency `@unlockable/vite-plugin-unlock`.
  - **Overrides** (`apps/medusa/src/admin/overrides/`):
    - `login.tsx` — branding; exports `Component` (and default per route/unlock expectations).
    - `home.tsx` — redirect `/` → `/chef-events`.
    - `menu.config.ts` — `MenuConfig`: remove routes, add Menus/Chef Events, custom `order`.
    - `order-list-table.tsx` — orders list table; extended query fields; column customizations.
    - `order-detail.tsx` — fork: no `OrderFulfillmentSection`; re-exports `Breadcrumb`, `loader`; imports `OrderSummarySection` from **`./order-summary-section`** (not `~dashboard`).
    - `order-summary-section.tsx` — fork: `CostBreakdown` includes `OrderStripePayoutBreakdown`.
  - **Admin UI helper:** `apps/medusa/src/admin/components/order-stripe-payout-breakdown.tsx`.
  - **Shared lib:** `apps/medusa/src/lib/order-stripe-payout.ts` — flatten payments, normalize Stripe Connect `provider_id`, extract commission / gross for display.
  - **TypeScript:** `apps/medusa/src/admin/tsconfig.json`, `dashboard-imports.d.ts`, `ambient.d.ts`; root `apps/medusa/tsconfig.json` excludes overrides from default `tsc` where configured.
  - **Docs:** `docs/medusa-admin-unlock-overrides.md`.
  - **Removed:** sidebar/widget approach for commission (e.g. `order-commission-widget.tsx` deleted in favor of Summary-embedded payout).
- **Related but not “unlock basename” overrides**
  - Custom admin routes under `apps/medusa/src/admin/routes/` (e.g. chef-events, menus)—wired as extensions; **referenced** by `menu.config.ts`.
- **Out of scope**
  - Automated admin e2e in CI (manual smoke recommended).
  - Forking `@medusajs/dashboard` as a package.

### Functional Narrative

#### Flow: Sign-in (`/login`)

- Branded copy and mark; auth behavior unchanged; post-login fallback aligns with **`/chef-events`** where configured in login override.

#### Flow: Default admin root (`/`)

- User is redirected to **`/chef-events`** via `home.tsx` override.

#### Flow: Orders list (`/orders`)

- Table uses override for columns/fields; fulfillment labeling/event-oriented behavior per `order-list-table.tsx` implementation.

#### Flow: Order detail

- Main column: summary + payment sections **without** fulfillment section (per `order-detail.tsx` override).
- Summary: after tax breakdown, **Payout** block when a payment matches Stripe Connect and order totals allow display.

### Technical Notes & Dependencies

- **Repo entry points:** `apps/medusa/medusa-config.ts`; overrides dir `./src/admin/overrides`.
- **Package manager:** yarn 4 (`packageManager: yarn@4.5.0` in `apps/medusa/package.json`).
- **Import alias:** `~dashboard/*` = original dashboard only; use relative paths between co-overridden modules.

---

## PART 2: IMPLEMENTATION PLAN

### Scope & Assumptions

- **Scope:** Medusa app admin Vite pipeline, overrides directory, supporting `src/lib` + `src/admin` helpers, and documentation.
- **Assumptions:** Medusa `admin.vite()` accepts extra plugins; basename overrides match dashboard tree files for the installed `@medusajs/dashboard` version.

### Implementation Tasks

#### Task 1: Add `@unlockable/vite-plugin-unlock` and wire Medusa admin Vite

- **Objective:** Install plugin; enable Medusa preset with `overrides: "./src/admin/overrides"`.
- **Files:** `apps/medusa/package.json`, `apps/medusa/medusa-config.ts`, `yarn.lock`.
- **Acceptance:** `yarn install`; `medusa develop` / `yarn build` (Medusa) succeeds; with `debug: true` in dev, logs show resolved overrides.

#### Task 2: `login.tsx` override

- **Objective:** Branded heading, subtitle, document title, mark; preserve auth.
- **Files:** `apps/medusa/src/admin/overrides/login.tsx`; assets as referenced by that file.

#### Task 3: `home.tsx` override

- **Objective:** Redirect admin `/` to `/chef-events`.
- **Files:** `apps/medusa/src/admin/overrides/home.tsx`.

#### Task 4: `menu.config.ts` patch

- **Objective:** Sidebar `remove` / `add` / `order` per product (Menus, Chef Events, drop Inventory/Price Lists, etc.).
- **Files:** `apps/medusa/src/admin/overrides/menu.config.ts`.
- **Note:** `add` paths should align with custom routes under `src/admin/routes/` so plugin can de-duplicate Extensions entries.

#### Task 5: `order-list-table.tsx` override

- **Objective:** Orders list behavior + field extensions + column mapping (event/fulfillment UX, exclusions).
- **Files:** `apps/medusa/src/admin/overrides/order-list-table.tsx`; possibly shared helpers (e.g. `apps/medusa/src/lib/event-ticket.ts` if used).

#### Task 6: `order-detail.tsx` + `order-summary-section.tsx` forks

- **Objective:** Remove fulfillment section from order detail; embed Stripe Connect payout in Summary `CostBreakdown`; keep route exports compatible with lazy route loading.
- **Files:**
  - `apps/medusa/src/admin/overrides/order-detail.tsx` — import **`OrderSummarySection` from `./order-summary-section`**; re-export `Breadcrumb`, `loader` from `~dashboard` paths.
  - `apps/medusa/src/admin/overrides/order-summary-section.tsx` — render `OrderStripePayoutBreakdown` inside `CostBreakdown`.
  - `apps/medusa/src/admin/components/order-stripe-payout-breakdown.tsx`
  - `apps/medusa/src/lib/order-stripe-payout.ts`
- **Acceptance:** Payout visible when order retrieve includes `payment_collections[].payments[]` with Stripe Connect `provider_id` and fee-related `data`; no breadcrumb regression.

#### Task 7: TypeScript / IDE support for overrides

- **Objective:** Optional `tsc` for overrides + `declare module` for each `~dashboard` import used.
- **Files:** `apps/medusa/src/admin/tsconfig.json`, `dashboard-imports.d.ts`, `ambient.d.ts`; root `apps/medusa/tsconfig.json` policy for excluding `src/admin/overrides`.

#### Task 8: Documentation

- **Objective:** Single place describing wiring, basename rules, `menu.config`, relative-import pitfall, and examples.
- **Files:** `docs/medusa-admin-unlock-overrides.md`.

### Implementation Guidance

- **Relative imports between overrides:** If module A and B are both overridden, **A → B** should be `import { B } from "./b"` (same folder) or correct relative path—not `~dashboard/.../b`.
- **Medusa config:** Follow `defineConfig` / `loadEnv` patterns in `apps/medusa/medusa-config.ts`.
- **Accessibility:** Meaningful `alt` / labels on branded imagery.

### Release & Delivery Strategy

- Normal PR review; smoke login, `/` redirect, sidebar, orders list, order detail Summary + Payments after deploy.

---

## Risks & Open Questions

| Item | Type | Mitigation |
| --- | --- | --- |
| `~dashboard` vs relative import for co-overridden modules | Risk | Document in plan + `docs/medusa-admin-unlock-overrides.md`; use relative path from `order-detail` → `order-summary-section`. |
| Plugin / dashboard API drift | Risk | Pin versions; unlock `debug` on upgrade branches. |
| Large fork drift (`order-summary-section`) | Risk | Re-diff upstream file on `@medusajs/dashboard` bumps; keep `// @ts-nocheck` scope minimal if TS improves later. |
| Original clarification scope vs expanded implementation | Process | This plan supersedes “login + orders column only” as **historical** minimum; AGENTS.md / checklist should match this doc. |

---

## Progress Tracking

Use `.devagent/workspace/tasks/completed/2026-03-29_override-medusa-admin-overrides/AGENTS.md` for historical checklist; task is complete. Align checklist items with **Task 1–8** above.

---

## Implementation inventory (quick reference)

| Area | Path(s) |
| --- | --- |
| Vite + plugin | `apps/medusa/medusa-config.ts`, `apps/medusa/package.json` |
| Overrides | `apps/medusa/src/admin/overrides/login.tsx`, `home.tsx`, `menu.config.ts`, `order-list-table.tsx`, `order-detail.tsx`, `order-summary-section.tsx` |
| Payout UI + lib | `apps/medusa/src/admin/components/order-stripe-payout-breakdown.tsx`, `apps/medusa/src/lib/order-stripe-payout.ts` |
| TS shim | `apps/medusa/src/admin/tsconfig.json`, `dashboard-imports.d.ts`, `ambient.d.ts` |
| Docs | `docs/medusa-admin-unlock-overrides.md` |
| Custom routes (related) | `apps/medusa/src/admin/routes/**` |

---

## Appendices & References

- Task hub: `AGENTS.md`
- Clarification: `clarification/2026-03-29_initial-clarification.md`
- Research: `research/2026-03-29_medusa-admin-overrides-with-vite-plugin-unlock.md`
- Repo guide: `docs/medusa-admin-unlock-overrides.md`
- Plugin: [unlockablejs/vite-plugin-unlock](https://github.com/unlockablejs/vite-plugin-unlock)
