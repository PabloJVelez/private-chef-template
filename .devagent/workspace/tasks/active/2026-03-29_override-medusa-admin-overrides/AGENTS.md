# Override Medusa Admin with Vite Plugin Unlock

- Owner: PabloJVelez
- Last Updated: 2026-03-29
- Status: Active
- Task Hub: `.devagent/workspace/tasks/active/2026-03-29_override-medusa-admin-overrides/`

## Summary

This task integrates `@unlockable/vite-plugin-unlock` into the Medusa admin Vite build so we can replace selected `@medusajs/dashboard` modules **without forking** the package. Implemented work includes branded login, default landing redirect to Chef Events, sidebar `menu.config.ts`, an orders list table override (extended fields + **Event** column from ticket line items, fulfillment column hidden, sales channel column excluded), order detail + summary forks (no fulfillment section on detail; Stripe Connect **Payout** block in Summary), shared payout logic under `src/lib`, admin TypeScript shims for `~dashboard`, and **`docs/medusa-admin-unlock-overrides.md`** as the operational guide.

## Key Decisions

- [2026-03-29] Decision: Track Medusa admin override work via this DevAgent task hub; use `@unlockable/vite-plugin-unlock` Medusa preset with `./src/admin/overrides` as the override directory (`medusa-config.ts`).
- [2026-03-29] Decision: When one override imports another overridden module (e.g. `order-detail` → `OrderSummarySection`), use a **relative import** (`./order-summary-section`). Imports from `~dashboard/...` resolve to **original** dashboard sources, so they will not load a sibling override.
- [2026-03-29] Decision: Commission / payout UX lives in the order **Summary** (`OrderStripePayoutBreakdown` + `order-stripe-payout.ts`), not a sidebar widget.

## Progress Log

- [2026-03-29] Event: Created task hub and initial plan (login + orders list); see `plan/2026-03-29_medusa-admin-vite-unlock-overrides.md`.
- [2026-03-29] Event: Wired plugin in `apps/medusa/medusa-config.ts`; root `tsconfig` excludes `src/admin/overrides` from default Medusa `tsc`; parallel `src/admin/tsconfig.json` + `dashboard-imports.d.ts` for IDE/`tsc -p` on overrides.
- [2026-03-29] Event: Overrides landed — `login.tsx`, `home.tsx` (`/` → `/chef-events`), `menu.config.ts`, `order-list-table.tsx`, `order-detail.tsx`, `order-summary-section.tsx`; payout helper `src/admin/components/order-stripe-payout-breakdown.tsx` + `src/lib/order-stripe-payout.ts`.
- [2026-03-29] Event: Fixed Summary payout not rendering by importing `OrderSummarySection` from `./order-summary-section` in `order-detail.tsx` (not `~dashboard`).
- [2026-03-29] Event: Plan doc expanded to match shipped scope; added `docs/medusa-admin-unlock-overrides.md`.

## Implementation Checklist

Aligned with `plan/2026-03-29_medusa-admin-vite-unlock-overrides.md` (Tasks 1–8).

- [x] **Task 1 — Plugin:** `@unlockable/vite-plugin-unlock` devDependency; `admin.vite` registers `unlock(unlockMedusa({ overrides: "./src/admin/overrides", debug: … }))`.
- [x] **Task 2 — Login:** `overrides/login.tsx` — Private Chef branding; auth flow unchanged; route exports (`Component` / default as needed).
- [x] **Task 3 — Home:** `overrides/home.tsx` — redirect `/` to `/chef-events`.
- [x] **Task 4 — Menu:** `overrides/menu.config.ts` — remove Inventory / Price Lists; add Menus & Chef Events; custom `order` (Chef Events first, etc.).
- [x] **Task 5 — Orders list:** `overrides/order-list-table.tsx` — `ORDER_LIST_FIELDS` with `*items`; Event column; hide fulfillment; exclude sales channel; uses `lib/event-ticket.ts` for SKU detection.
- [x] **Task 6 — Order detail + Summary:** `overrides/order-detail.tsx` (no `OrderFulfillmentSection`; re-export `Breadcrumb` + `loader`; relative `OrderSummarySection`); `overrides/order-summary-section.tsx` embeds payout; `order-stripe-payout-breakdown.tsx` + `lib/order-stripe-payout.ts`.
- [x] **Task 7 — TypeScript:** `src/admin/tsconfig.json`, `dashboard-imports.d.ts`, `ambient.d.ts` for `~dashboard` imports used in overrides.
- [x] **Task 8 — Docs:** `docs/medusa-admin-unlock-overrides.md`.
- [ ] **Ongoing — QA:** Manual smoke after Medusa/dashboard upgrades (login, `/` redirect, sidebar, `/orders`, order detail Summary + Payments, `yarn build` in `apps/medusa`). No automated admin e2e in repo.

## Open Questions

- Do we need different login copy or `home` redirect targets for **staging vs production** (e.g. env-driven)?
- After future `@medusajs/dashboard` upgrades, re-diff oversized forks (`order-summary-section.tsx`, `order-detail.tsx`) against upstream; any process owner for that merge?

## References

- [2026-03-29] Repo guide: `docs/medusa-admin-unlock-overrides.md` — wiring, basename rules, `menu.config`, relative-import pitfall, examples.
- [2026-03-29] Plan: `.devagent/workspace/tasks/active/2026-03-29_override-medusa-admin-overrides/plan/2026-03-29_medusa-admin-vite-unlock-overrides.md`
- [2026-03-29] Plugin: [unlockablejs/vite-plugin-unlock](https://github.com/unlockablejs/vite-plugin-unlock)
- [2026-03-29] Clarification (historical scope): `clarification/2026-03-29_initial-clarification.md`
- [2026-03-29] Research: `research/2026-03-29_medusa-admin-overrides-with-vite-plugin-unlock.md`
