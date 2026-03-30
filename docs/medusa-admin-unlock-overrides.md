# Medusa admin UI overrides (`@unlockable/vite-plugin-unlock`)

This project customizes the stock Medusa admin (`@medusajs/dashboard`) **without forking** the package. Overrides are applied at Vite build time via [`@unlockable/vite-plugin-unlock`](https://github.com/unlockablejs/vite-plugin-unlock), using the plugin’s **Medusa preset**.

Upstream plugin docs (options, generic usage, menu config types) live in that repository; this document focuses on **how we use it here** and **what you can realistically change**.

## How it is wired in this repo

In `apps/medusa/medusa-config.ts`, the admin Vite config registers the plugin with the Medusa helper and an overrides directory:

```ts
import { unlock } from "@unlockable/vite-plugin-unlock";
import { medusa as unlockMedusa } from "@unlockable/vite-plugin-unlock/medusa";

admin: {
  disable: false,
  backendUrl: process.env.ADMIN_BACKEND_URL,
  vite: () => ({
    plugins: [
      unlock(
        unlockMedusa({
          overrides: "./src/admin/overrides",
          debug: process.env.NODE_ENV === "development",
        }),
      ),
    ],
  }),
},
```

With `debug: true` in development, the build logs which dashboard files are replaced.

**Package:** `apps/medusa/package.json` lists `@unlockable/vite-plugin-unlock` as a dev dependency.

## What you can change

The plugin builds an index of **all source files** under `@medusajs/dashboard/src/` (by **basename**). Any file you add under `apps/medusa/src/admin/overrides/` whose **filename** matches a dashboard file replaces that module for both dev and production admin builds.

That means you can override, in principle:

| Kind | Examples | Notes |
|------|----------|--------|
| **Route / page modules** | `order-list.tsx`, `login.tsx` | Often must expose the lazy route shape the dashboard expects (see below). |
| **Components** | Any `*.tsx` that exists in the dashboard tree | Reuse dashboard pieces via `~dashboard/...` imports. |
| **Hooks / utilities** | Any `*.ts` / `*.tsx` matched by basename | Same matching rules; useful for table columns, queries, etc. |
| **Sidebar** | `menu.config.ts` in the overrides folder | Full menu rewrite via `MenuConfig` (see plugin README). |

You **cannot** use this plugin to change **server-only** behavior (API routes, workflows, subscribers). Those stay in `apps/medusa/src/` as normal Medusa code. The admin only sees what the **Admin API** returns; if you need extra fields in a table, extend list `fields`/relations in the override (as with orders + `*items`) or add backend endpoints and call them from the override.

### Import alias

Override files may import the **original** dashboard source using the **`~dashboard`** alias (configured by the Medusa preset), for example:

`import { useOrders } from "~dashboard/hooks/api/orders"`

### TypeScript, IDE, and `tsc`

`apps/medusa/tsconfig.json` **excludes** `src/admin/overrides` so the root Medusa `tsc` run does not typecheck dashboard paths pulled in through `~dashboard`.

The alias **`~dashboard/*` exists only in the admin Vite build** (injected by `@unlockable/vite-plugin-unlock`). The editor’s TypeScript language service does not read that Vite config, so without extra setup you see **TS2307 — Cannot find module '~dashboard/…'**.

This repo adds a **small parallel project** for overrides:

- `apps/medusa/src/admin/tsconfig.json` — includes `overrides/**/*.tsx` and the declarations below.
- `apps/medusa/src/admin/dashboard-imports.d.ts` — **`declare module`** entries for each `~dashboard/…` import used in overrides (exports are mostly `any`, plus a type guard for `isFetchError` where strict narrowing is needed).

When you add a **new** `~dashboard/…` import, add a matching `declare module` line there (or the IDE will report unresolved modules again).

Optional check: `npx tsc -p apps/medusa/src/admin/tsconfig.json` (from `apps/medusa`). The **authoritative** compile for the admin UI remains **`yarn build`** in `apps/medusa` (Vite + unlock).

## How to add a new override

1. **Find the real file** in `apps/medusa/node_modules/@medusajs/dashboard/src/…` (search by feature or route name).
2. **Note the basename** (e.g. `order-list-table.tsx`).
3. **Create** `apps/medusa/src/admin/overrides/<same-basename>` (nesting under subfolders is optional; matching is by basename only).
4. **Copy or recompose** the original implementation: prefer importing and reusing dashboard modules rather than duplicating large trees.
5. Run **`yarn build`** from `apps/medusa` and confirm the plugin lists your override in the log.

After Medusa upgrades, **re-check** that the basename still exists and the public API of that module has not changed.

## Examples in this codebase

### 1. Default landing (`home.tsx`)

- The dashboard’s `routes/home` component redirects `/` (within the admin router). This repo overrides it to send users to **`/chef-events`** instead of `/orders`.
- The login override’s post-auth fallback when no `location.state.from` is set also uses **`/chef-events`** so sign-in matches that default.

### 2. Login page (`login.tsx`)

- **Overrides** the dashboard login module with the same filename.
- Custom branding (copy, document title, favicon treatment) while keeping the same auth flow and `~dashboard` imports (`Form`, `useSignInWithEmailPass`, etc.).
- Exports both:
  - `export { Login as Component }` for the route loader pattern used in the dashboard.
  - `export default Login` because the unlock plugin’s synthetic module may expect a default export for the route entry.

### 3. Sidebar menu (`menu.config.ts`)

- **`menu.config.ts`** in `overrides/` is consumed by the unlock Medusa preset as a **patch** to `main-layout.tsx` (not a file override). Use **`remove`** to drop core entries by route path, **`add`** to insert top-level nav rows (with `icon`, `label`, `to`), and **`order`** to sort by `to` paths.
- If **`add`** uses the same `to` as a custom route from `src/admin/routes/`, the unlock patch **hides** that item from the **Extensions** block so it only appears as the new core row (see plugin `__getPromotedPaths`).
- To tuck a custom route **under** an existing core flyout (e.g. under Products with Collections), use `defineRouteConfig({ nested: "/products" })` instead of duplicating it in `add`.

### 4. Order detail layout & summary (`order-detail.tsx`, `order-summary-section.tsx`)

- **`order-detail.tsx`** — fork of the dashboard order page: drops **`OrderFulfillmentSection`** from the main column (no fulfillment card). Payout UI lives in the summary instead of the `order.details.side.before` widget zone. **Re-export `Breadcrumb` and `loader`** from the same paths as upstream (`~dashboard/routes/orders/order-detail/breadcrumb` and `loader`): the route’s lazy `import("…/order-detail")` is resolved to this override file, so without those exports `Breadcrumb` is `undefined` and the shell breadcrumbs crash.
- **`order-summary-section.tsx`** — fork of the dashboard Summary card: after **tax** rows in **`CostBreakdown`**, renders **`OrderStripePayoutBreakdown`** (Stripe Connect gross, processing fees when applicable, platform commission, chef take-home). Logic is shared from `apps/medusa/src/lib/order-stripe-payout.ts` and `apps/medusa/src/admin/components/order-stripe-payout-breakdown.tsx`.
- These forks carry `// @ts-nocheck` because they import many internal `~dashboard/*` modules; the shape is intentionally aligned with upstream for easier merges on Medusa upgrades.

### 5. Orders list table (`order-list-table.tsx`)

- **Overrides** the orders list table component (not necessarily the whole route), reusing `_DataTable`, `useOrders`, `useOrderTableQuery`, and `useOrderTableColumns`.
- **Extends** the orders list query `fields` (e.g. `DEFAULT_FIELDS` plus `*items`) so cells can read line items.
- **Replaces** a column by mapping TanStack column definitions: e.g. swap the fulfillment column for an **Event** column derived from event-ticket line items (`EVENT-*` SKUs, shared helper in `apps/medusa/src/lib/event-ticket.ts`).
- **Excludes** columns via `useOrderTableColumns({ exclude: [...] })` (e.g. hiding **Sales channel**).

Together, these show the usual patterns: **thin overrides** + **`menu.config` patches** (`remove` / `add` / `order`) + **optional `nested` on custom routes** + **reuse dashboard hooks/components** where needed.

## Operational tips

- Prefer **small, targeted overrides** (one component or hook) over copying entire routes unless you must.
- Rely on **`yarn build` in `apps/medusa`** as the gate for admin TypeScript and unlock resolution.
- When something breaks after upgrading `@medusajs/dashboard`, compare your override to the **new** upstream file of the same basename and merge behavior changes.

## Reference

- Plugin repository: [unlockablejs/vite-plugin-unlock](https://github.com/unlockablejs/vite-plugin-unlock)
- Local overrides directory: `apps/medusa/src/admin/overrides/`
