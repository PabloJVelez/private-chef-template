# Unified Seed Script for Project Initialization — Plan

- Owner: PabloJVelez
- Last Updated: 2026-03-14
- Status: Draft
- Related Task Hub: `.devagent/workspace/tasks/completed/2026-03-14_unified-seed-script/`
- Stakeholders: PabloJVelez (Requestor, Decision Maker)
- Notes: Based on clarification packet `clarification/2026-03-14_initial-clarification.md`

---

## PART 1: PRODUCT CONTEXT

### Summary

The project has multiple seed scripts inherited from the lambdacurry Medusa coffee-shop starter. There is no single runnable command to initialize the project successfully. This plan consolidates all seed logic into one unified script that performs a selective wipe and reseeds with US-only, chef-experience-focused data, creates an admin user, and relocates old scripts to an archive directory.

### Context & Problem

- **Current state:** Six seed scripts (`seed.ts`, `seed-menus.ts`, `seed/products.ts`, `seed/reviews.ts`, `seed/menus.ts`, `create-digital-shipping.ts`) with overlapping concerns, coffee-related references, and US+Canada regions.
- **User pain:** Developers don't know which script to run or in what order; `medusa:init` chains `seed:menus` + `add-user` but doesn't use the full seed; no single "run this to succeed" entry point.
- **Business trigger:** Private-chef template needs a repeatable, fast path for new clients (2-week dev demo, ~1 month first mock order per mission).

### Objectives & Success Metrics

- **Objective 1:** One runnable script (`yarn init` or `yarn seed:init`) that wipes seeded entities and reseeds the project.
- **Objective 2:** US region only; chef experiences (menus + menu products) only; no physical/coffee products.
- **Objective 3:** Admin user `pmltechpile@gmail.com` / `password!` created as part of init flow.
- **Success:** Running `yarn init` (or equivalent) brings the project up successfully; developer can log into admin and see chef experience products.

### Users & Insights

- **Primary user:** Developer/agency setting up a new chef client from this template.
- **Insight:** Existing `medusa:init` runs `seed:menus` + `add-user`; the template playbook (Phase 6) references Medusa DB + seed + admin user.

### Solution Principles

- Selective wipe preserves schema and migrations; only seeded entities are deleted.
- Single source of truth for init: one script, one npm script to run.
- Old scripts preserved in `apps/medusa/src/scripts/old-scripts/` for reference.

### Scope Definition

**In Scope:**

- Consolidate seed logic into one unified script (`init.ts` or `seed-init.ts`)
- Selective wipe before seed (regions, products, menus, orders, reviews, categories, tags, collections, shipping, fulfillment, sales channels, api keys, links)
- US region only; USD only; no Canada
- Chef experiences only (menus + menu products from `seed/menus.ts`); remove physical/coffee products
- Admin user creation via `medusa user` CLI (chained in init npm script)
- Move existing scripts to `apps/medusa/src/scripts/old-scripts/`
- Update `package.json` scripts: `init` (or `seed:init`), `add-user` with new credentials

**Out of Scope / Future:**

- Canada region, CAD, Canada shipping
- Physical product catalog, coffee roasts, grind options, origin tags
- Orders and product reviews (optional demo data—defer unless needed for first mock order flow)

### Functional Narrative

**Init Flow**

- Trigger: Developer runs `yarn init` (or `yarn seed:init`) after migrations.
- Experience: Script (1) selectively wipes seeded entities in correct FK order, (2) seeds store, region, fulfillment, shipping, sales channels, collections, categories, tags, menus, menu products, links, publishable API key, (3) logs publishable API key and instructs or chains admin user creation.
- Acceptance: Admin login works; storefront shows chef experience products; checkout can complete a test order.

---

## PART 2: IMPLEMENTATION PLAN

### Scope & Assumptions

- **Scope focus:** Full task — one implementation pass.
- **Key assumptions:**
  - Medusa `medusa user --email ... --password ...` CLI creates admin users (existing pattern in `package.json`).
  - Module services (Product, Region, Menu, etc.) expose delete/softDelete methods; selective wipe uses these in reverse FK order.
  - Menu module (`menuModuleService`) has delete methods for menus, courses, dishes, ingredients.
- **Out of scope:** Programmatic admin user creation inside the seed script; we chain `medusa user` in the init npm script.

### Implementation Tasks

#### Task 1: Relocate existing scripts to `old-scripts/`

- **Objective:** Move current seed scripts into `apps/medusa/src/scripts/old-scripts/` so the unified script becomes the single entry point.
- **Impacted Modules/Files:**
  - `apps/medusa/src/scripts/seed.ts` → `apps/medusa/src/scripts/old-scripts/seed.ts`
  - `apps/medusa/src/scripts/seed-menus.ts` → `apps/medusa/src/scripts/old-scripts/seed-menus.ts`
  - `apps/medusa/src/scripts/create-digital-shipping.ts` → `apps/medusa/src/scripts/old-scripts/create-digital-shipping.ts`
  - `apps/medusa/src/scripts/seed/` → `apps/medusa/src/scripts/old-scripts/seed/` (products.ts, reviews.ts, menus.ts, README-menus.md)
- **References:** Clarification packet; `apps/medusa/src/scripts/README.md`
- **Dependencies:** None
- **Acceptance Criteria:**
  - All listed files moved into `apps/medusa/src/scripts/old-scripts/`
  - No broken imports in remaining codebase (old scripts are not imported elsewhere after relocation)
- **Testing Criteria:** Verify `old-scripts/` contains all moved files; existing `package.json` scripts that referenced old paths are updated or removed in Task 5

---

#### Task 2: Implement selective wipe logic

- **Objective:** Add a wipe phase that deletes only seeded entities in correct FK order before seeding.
- **Impacted Modules/Files:**
  - New: `apps/medusa/src/scripts/wipe-seeded-data.ts` (or inlined in init script)
- **References:** Medusa module services (`@medusajs/framework/utils` Modules), `seed.ts` and `seed-menus.ts` for entity list; `.cursor/rules/medusa-development.mdc`
- **Dependencies:** None
- **Acceptance Criteria:**
  - Wipe deletes (in order): product review responses → product reviews → orders → product-menu links → products → menu entities (ingredients → dishes → courses → menus) → shipping options → stock-location/fulfillment links → collections → categories → tags → regions → tax regions → stock locations → fulfillment sets/profiles → sales channels → api keys
  - Schema and migrations are not modified
  - Idempotent: running wipe on empty DB does not error
- **Testing Criteria:** Run wipe then seed; verify no leftover data from prior run; run wipe twice to confirm idempotency
- **Subtasks:**
  1. Resolve delete APIs — Use `list` + `delete` (or `softDelete`) from module services; check `remoteLink` for link deletion
  2. Implement wipe functions in dependency order (children before parents)
  3. Handle optional entities (e.g. no product reviews if none exist) without error

---

#### Task 3: Implement unified seed script (US-only, chef experiences)

- **Objective:** Create `apps/medusa/src/scripts/init.ts` that seeds store, US region, fulfillment, shipping, sales channels, Chef Experiences collection/category/tags, menus, menu products, product-menu links, and publishable API key.
- **Impacted Modules/Files:**
  - New: `apps/medusa/src/scripts/init.ts`
  - New or extracted: `apps/medusa/src/scripts/seed/chef-experiences.ts` (refactor from `seed/menus.ts` — menus + menu products only, USD pricing)
- **References:** `seed-menus.ts`, `seed/menus.ts`, `seed/products.ts` (for structure only — we remove coffee); clarification packet
- **Dependencies:** Task 2 (wipe); Task 1 (old scripts moved so we can create new structure)
- **Acceptance Criteria:**
  - US region only; USD only; `pp_stripe-connect_stripe-connect` as payment provider
  - Store supported_currencies: `[usd]` only
  - Fulfillment set: US only (no Canada geo zones)
  - Collections: `Chef Experiences` only
  - Categories: `Chef Experiences` only
  - Tags: chef-relevant (e.g. `Chef Experience`, `Limited Availability`)
  - Menus from `menuDefinitions`; menu products from `seedMenuProducts`; product-menu links created
  - Publishable API key created and linked to default sales channel
  - Script logs publishable API key at end
- **Testing Criteria:** Run init; verify admin shows chef experience products; storefront displays them; region is US only
- **Subtasks:**
  1. Extract/adapt `seedMenuEntities` and `seedMenuProducts` from `old-scripts/seed/menus.ts` — remove CAD pricing, keep USD only
  2. Create US-only store, region, fulfillment, shipping, sales channels
  3. Create Chef Experiences collection, category, tags
  4. Create menus, menu products, links
  5. Create publishable API key

---

#### Task 4: Wire admin user creation and init npm script

- **Objective:** Ensure admin user `pmltechpile@gmail.com` / `password!` is created as part of init flow; update npm scripts.
- **Impacted Modules/Files:**
  - `apps/medusa/package.json`
- **References:** Existing `add-user`, `add-user:prod`, `medusa:init`; clarification packet
- **Dependencies:** Task 3
- **Acceptance Criteria:**
  - `add-user` runs `medusa user --email pmltechpile@gmail.com --password "password!"`
  - New `init` script: runs wipe + seed (init.ts) + add-user in sequence, e.g. `medusa exec ./src/scripts/init.ts && medusa user --email pmltechpile@gmail.com --password "password!"`
  - Or: `init` = `yarn nukedb && medusa db:create --db chef-template && yarn migrate && yarn sync && medusa exec ./src/scripts/init.ts && yarn add-user` (if full reset desired)
  - `medusa:init` updated to use new init script instead of seed:menus
- **Testing Criteria:** Run init; log into admin with pmltechpile@gmail.com / password!; verify access

---

#### Task 5: Update documentation and remove obsolete script references

- **Objective:** Update README, plug-in playbook, and any docs that reference old seed scripts or init flow.
- **Impacted Modules/Files:**
  - `apps/medusa/package.json` — remove or update `seed`, `seed:menus` script references if they pointed to moved files
  - `apps/medusa/src/scripts/README.md`
  - `docs/plug-in-chef-playbook.md` (Phase 6)
  - `docs/templatized-values-inventory.md` (if it references seed)
- **References:** `docs/plug-in-chef-playbook.md`
- **Dependencies:** Task 4
- **Acceptance Criteria:**
  - README and playbook document single init command (e.g. `yarn init`)
  - Old script references updated to point to `old-scripts/` or removed
  - No broken `package.json` script paths
- **Testing Criteria:** Follow updated playbook; init succeeds; no stale references in docs

---

### Implementation Guidance

**From `.cursor/rules/medusa-development.mdc`:**

- Use Medusa v2 module patterns: resolve services via `container.resolve(Modules.X)` or custom module names
- Follow dependency injection; use workflows where available (`createRegionsWorkflow`, `createProductsWorkflow`, etc.)
- Use Zod for validation when parsing input

**From `apps/medusa/src/scripts/seed-menus.ts`:**

- `ensureUSRegion`, `ensureFulfillmentSet`, etc. use "ensure" pattern — create if not exists. For init we wipe first, so "create" semantics apply.
- Fulfillment set uses `service_zones` with `geo_zones` for US only (no Canada)

**From `apps/medusa/package.json`:**

- Existing init: `medusa:init` = nukedb + create db + migrate + sync + seed:menus + add-user
- Use `medusa exec ./src/scripts/init.ts` for script execution

**Selective wipe order (reference):**

1. Product review responses (lambdacurry workflow if available, or module)
2. Product reviews
3. Orders (order module)
4. Remote links (product-menu)
5. Products (product module)
6. Menu: ingredients → dishes → courses → menus (menuModuleService)
7. Shipping options
8. Stock location / fulfillment links (remoteLink)
9. Collections, categories, tags
10. Regions, tax regions
11. Stock locations
12. Fulfillment sets, shipping profiles
13. Sales channels
14. Api keys (publishable)

---

### Release & Delivery Strategy

- Single implementation pass; no phased rollout
- Verification: Run `yarn init` (or equivalent) on fresh clone after env setup; confirm admin login and storefront products

---

## Risks & Open Questions

| Item | Type | Owner | Mitigation / Next Step | Due |
|------|------|-------|------------------------|-----|
| Module delete APIs may vary (softDelete vs delete, bulk vs single) | Risk | Implementing dev | Discover during Task 2; use MedusaService-generated methods | — |
| FK constraints may require different delete order than listed | Risk | Implementing dev | Add explicit ordering if errors occur; test on real DB | — |
| `medusa user` may prompt for confirmation in some environments | Question | Implementing dev | Use non-interactive flags if available; document manual fallback | — |
| Product reviews / orders: Keep for chef experience products? | Question | PabloJVelez | Deferred; init can ship without orders/reviews; add later if needed for demo | — |

---

## Progress Tracking

Refer to `AGENTS.md` in the task directory for progress logging during implementation.

---

## Appendices & References

- **Clarification packet:** `.devagent/workspace/tasks/completed/2026-03-14_unified-seed-script/clarification/2026-03-14_initial-clarification.md`
- **Task AGENTS.md:** `.devagent/workspace/tasks/completed/2026-03-14_unified-seed-script/AGENTS.md`
- **Product mission:** `.devagent/workspace/product/mission.md`
- **Plug-in playbook:** `docs/plug-in-chef-playbook.md`
- **Seed scripts (pre-relocation):** `apps/medusa/src/scripts/seed.ts`, `seed-menus.ts`, `seed/menus.ts`, `seed/products.ts`, `seed/reviews.ts`, `create-digital-shipping.ts`
- **Medusa development rules:** `.cursor/rules/medusa-development.mdc`
