# Experience types (v1) — Implementation plan

- **Owner:** PabloJVelez
- **Last Updated:** 2026-04-13
- **Status:** In Progress (v1.2 — dynamic event types + menu × experience pricing)
- **Related task hub:** `.devagent/workspace/tasks/active/2026-04-11_port-experience-types-sdoa/`
- **Stakeholders:** PabloJVelez (Owner / Decision Maker)
- **Upstream artifacts:** `research/2026-04-11_experience-types-parity-research.md`, `clarification/2026-04-11_initial-clarification.md`
- **Engineering reference (sibling):** `/Users/pablo/Personal/development/sdoa/sdoa/docs/experience-types.md` and corresponding paths under `sdoa/apps/medusa/` (do not ship sibling codenames in customer-facing copy)

---

## PART 1: PRODUCT CONTEXT

### Summary

Private-chef-template will gain a **database-backed catalog of experience types** that chefs manage in Medusa Admin, with **store APIs** feeding both the **marketing homepage** and the **event request** flow. Each **chef event** references a catalog row via **`experience_type_id`**. The **experience type's name** is stored directly in **`chef_event.eventType`** as free text — there is **no fixed enum**. This gives chefs **full dynamic control**: creating "Catering", "Meal Prep", "Wine Pairing Dinner", or any offering they like, without code changes or growing an enum. **Pickup / product-based flows** stay **out of v1** (phase 2).

### Context & problem

- **Current state (pre-v1):** No `experience-type` module; storefront uses **static** arrays in `ExperienceTypes.tsx` and `EventTypeSelector.tsx`; `POST /store/chef-events` uses fixed per-`eventType` pricing only; `chef_event.eventType` is a **fixed enum** (`cooking_class | plated_dinner | buffet_style`); `chef_event` has **no** catalog FK.
- **Trigger:** Port proven sibling architecture so each new chef can define offerings in admin without code changes ([clarification](.devagent/workspace/tasks/active/2026-04-11_port-experience-types-sdoa/clarification/2026-04-11_initial-clarification.md)).
- **v1.0 → v1.1 revision (2026-04-13):** The original plan kept `chef_event.eventType` as a three-value enum and added a `workflow_event_type` field on `experience_type` to map catalog rows to workflow buckets. This contradicted the core goal of **dynamic** experience types — chefs were still funneled into three fixed buckets. v1.1 removes the enum entirely and makes `eventType` a **free-text string** that stores the experience type's **name**.

### Objectives & success metrics

- **Primary:** Admin CRUD for experience types; store reads active catalog; customers submit requests that persist **`experience_type_id`** and **`eventType`** (the catalog name); homepage and request UI use the **same** server-backed data.
- **Secondary (v1.2):** Pricing is driven by a **menu × experience type** pricing matrix. Each menu can have per-person pricing for each experience type (e.g. "Chef's Table" menu charges $99/person for Buffet Style, $125/person for Cooking Class, $110/person for Meal Prep). This replaces the hardcoded `PRICING_STRUCTURE` / `FALLBACK_PRICING` constants.
- **Success (binary):** Chef can create any experience name in admin and a customer can submit a request for it; pricing reflects the selected menu + experience type combination; no duplicate static marketing vs request catalogs; migrations apply cleanly; no `pickup` / `product_based` booking path until phase 2.

### Users & insights

- **Primary:** Developer/agency shipping the template; chefs using Medusa Admin.
- **Secondary:** Storefront visitors choosing an experience and submitting a request.
- **Insight:** Dynamic offerings come from **catalog rows**. The `eventType` field stores the human-readable name, not a code. There is no mapping layer, no enum to extend.

### Solution principles

- **Medusa v2** custom module + API routes + workflows — align with `.cursor/rules/medusa-development.mdc` and existing `chef-event` / `menu` modules.
- **Remix/React Router** loaders and server data helpers — align with `.cursor/rules/remix-storefront-routing.mdc` and `.cursor/rules/remix-storefront-optimization.mdc` (no client-only fetch for SEO-critical catalog content where loaders already exist).
- **Key design decision (v1.1):** `chef_event.eventType` is **free text** (`model.text()`). The experience type catalog is the **source of truth** for what types exist. When a customer submits a request, the server resolves the experience type name and stores it in `eventType`. No `workflow_event_type` enum on `experience_type`. No fixed enum on `chef_event`.
- **Key design decision (v1.2 — pricing):** Pricing is driven by a **`menu_experience_price`** join table linking a **menu** to an **experience type** with a **`price_per_person`** (stored in cents). When a customer selects a menu + experience type, the server looks up the matching row to compute `totalPrice = price_per_person × partySize`. This replaces hardcoded `PRICING_STRUCTURE` / `FALLBACK_PRICING` constants and the `experience_type.price_per_unit` field. Legacy fallbacks remain only for chef events with no menu selected or missing pricing rows.

### Scope definition

- **In scope (v1):** `experience-type` module (model + migrations + service + `medusa-config`); admin + store HTTP routes; extended Admin SDK + hooks + admin UI; `chef_event.experience_type_id` FK + `eventType` converted to text; `createChefEventWorkflow` + store POST; storefront `experience-types.server.ts`; wire `_index` + `request._index` + event-type UI; seed script for default rows; sidebar placement for Experiences; email label resolution from catalog.
- **In scope (v1.2 — pricing):** `menu_experience_price` model + migration in the menu module; admin APIs and UI for managing per-menu per-experience-type pricing; store API to return pricing with menus; storefront request flow uses menu × experience type price for estimation and submission; `accept-chef-event` workflow uses the stored `totalPrice` (from the correct menu × experience pair) for the booking link product; deprecate hardcoded `PRICING_STRUCTURE` / `FALLBACK_PRICING` constants and `experience_type.price_per_unit`.
- **Out of scope / phase 2:** `pickup` flows; `selected_products`, pickup slots/location fields; storefront product selector; `accept-chef-event` pickup pricing; `product_based` booking.

### Functional narrative

#### Flow: Chef maintains catalog

- **Trigger:** Admin opens Experiences in the sidebar (promoted to main nav after Menus).
- **Narrative:** List, create, edit, delete; each row has a **name** (the experience type label), merchandising fields, optional `price_per_unit`, scheduling config. No `workflow_event_type` — the name **is** the type.
- **Acceptance:** Inactive rows do not appear on store list; slug unique; chef can create any name (e.g. "Catering", "Meal Prep", "Wine Pairing Dinner").

#### Flow: Customer browses homepage

- **Trigger:** Landing page load.
- **Narrative:** Loader fetches active experience types (same helper as request page); `ExperienceTypes` renders API-driven cards (featured/sort from DB); static fallback array used only when API returns empty.
- **Acceptance:** No hardcoded duplicate of catalog copy/prices.

#### Flow: Customer submits request

- **Trigger:** Request form submit.
- **Narrative:** User selects a **catalog** experience by **id**; payload includes **`experience_type_id`** and **`eventType`** (the name from the catalog); server resolves and stores both. Pricing logic remains unchanged from current implementation.
- **Acceptance:** Created `chef_event` has `eventType` = experience name (e.g. "Catering"), `experience_type_id` = catalog row id.

#### Flow: Emails and admin display

- **Trigger:** Event lifecycle emails (requested, accepted, rejected, resend, receipt) and admin detail view.
- **Narrative:** `resolveChefEventTypeEmailLabel()` loads the catalog row by `experience_type_id` and uses its **name**; falls back to `eventType` string stored on the event if catalog row is missing.
- **Acceptance:** Email says "Catering" (not "Plated Dinner Service") when the experience is "Catering".

### Technical notes & dependencies

- **Migrations:** New table `experience_type`; new column `chef_event.experience_type_id` + FK `ON DELETE SET NULL`; **convert** `chef_event.eventType` from enum to **text** (drop CHECK constraint).
- **`workflow_event_type`:** **Removed** from `experience_type` model; **removed** from all DTOs, APIs, admin forms, storefront DTOs, seed scripts.
- **Pricing (v1.2):** Replaced by **`menu_experience_price`** join table in the menu module. `PRICING_STRUCTURE` / `FALLBACK_PRICING` constants and `experience_type.price_per_unit` are deprecated. Legacy fallback only for events with no menu or missing pricing row.
- **`pricing_type` / `is_product_based`:** Kept on model for future phase 2 but not surfaced in v1 admin forms.
- **HTTP:** `POST /store/chef-events` returns **`201 Created`**.

---

## PART 2: IMPLEMENTATION PLAN

### Scope & assumptions

- **Scope:** v1 — fully dynamic experience types; no fixed `eventType` enum; no pickup.
- **Assumptions:** Sibling repo remains available for file-level diff; `yarn` / `medusa db:migrate` used as in repo README.
- **Out of scope:** Phase 2 pickup (documented below as future backlog).

### Implementation tasks

#### Task 1: `experience-type` Medusa module

- **Objective:** Persist catalog rows with merchandising, pricing, scheduling, and location fields. **No `workflow_event_type`.**
- **Impacted modules/files (expected):**
  - `apps/medusa/src/modules/experience-type/models/experience-type.ts` (new)
  - `apps/medusa/src/modules/experience-type/service.ts` — extend `MedusaService`; add `listActiveExperienceTypes()`, `getBySlug(slug)`
  - `apps/medusa/src/modules/experience-type/index.ts` — module registration + `EXPERIENCE_TYPE_MODULE` token
  - `apps/medusa/src/modules/experience-type/migrations/*.ts` — create table + indexes
  - `apps/medusa/medusa-config.ts` — register `{ resolve: './src/modules/experience-type', options: {} }`
- **Dependencies:** None.
- **Acceptance criteria:**
  - Module loads; `medusa db:migrate` creates `experience_type`.
  - `listActiveExperienceTypes` returns `is_active` rows ordered by `sort_order`.
  - `getBySlug` returns active row or null.
  - No `workflow_event_type` column on the table.

#### Task 2: Admin and store HTTP APIs

- **Objective:** CRUD (admin) and read-only list + by slug (store).
- **Impacted modules/files (expected):**
  - `apps/medusa/src/api/admin/experience-types/route.ts` (GET, POST)
  - `apps/medusa/src/api/admin/experience-types/[id]/route.ts` (GET, PUT, DELETE)
  - `apps/medusa/src/api/store/experience-types/route.ts` (GET → `listActiveExperienceTypes`)
  - `apps/medusa/src/api/store/experience-types/[slug]/route.ts` (GET → `getBySlug`)
- **Dependencies:** Task 1.
- **Acceptance criteria:**
  - Admin POST validates body; slug default from `slugify(name)` when omitted; **`name` required** (this is the experience type label).
  - No `workflow_event_type` in Zod schemas or API payloads.
  - Store GET returns `{ experience_types: [...] }` / `{ experience_type: {...} }` shapes.

#### Task 3: `chef_event` — convert `eventType` to text + FK + workflows + store POST

- **Objective:** Make `chef_event.eventType` a **free-text string** storing the experience name; link requests to catalog via `experience_type_id`. ~~Pricing logic is unchanged.~~ (Superseded by Task 7 — menu × experience pricing.)
- **Impacted modules/files (expected):**
  - `apps/medusa/src/modules/chef-event/models/chef-event.ts` — change `eventType` from `model.enum([...])` to `model.text()`; add `experience_type_id: model.text().nullable()`
  - `apps/medusa/src/modules/experience-type/migrations/*.ts` — add `chef_event.experience_type_id` column + FK; **drop** `chef_event.eventType` CHECK constraint and convert column to text
  - `apps/medusa/src/workflows/create-chef-event.ts` — `eventType: string`; accept optional `experience_type_id`
  - `apps/medusa/src/workflows/update-chef-event.ts` — `eventType?: string`
  - `apps/medusa/src/api/store/chef-events/route.ts` — Zod: `eventType: z.string()`; optional `experience_type_id`; if id present → load experience type → set `eventType = experienceType.name`; pricing resolution updated in Task 7; respond **201**
  - `apps/medusa/src/api/admin/chef-events/route.ts` + `[id]/route.ts` — `eventType: z.string()`; optional `experience_type_id`
  - All TypeScript types / DTOs referencing the old enum (`AdminChefEventDTO`, `StoreChefEventDTO`, `ChefEventType`, etc.) — change to `string`
- **Dependencies:** Tasks 1-2.
- **Acceptance criteria:**
  - Request with valid `experience_type_id` persists FK and `eventType` = experience **name** (server authoritative).
  - Request without id still works (eventType from body as-is).
  - No enum CHECK constraint on `chef_event.eventType` in DB.
  - ~~Pricing logic unchanged~~ — see Task 7 for menu × experience pricing refactor.

#### Task 4: Admin SDK, hooks, admin UI, sidebar

- **Objective:** Operators manage catalog from dashboard; Experiences in main sidebar after Menus; Products removed from sidebar.
- **Impacted modules/files (expected):**
  - `apps/medusa/src/sdk/admin/admin-experience-types.ts` (new)
  - `apps/medusa/src/sdk/admin/index.ts`, `apps/medusa/src/sdk/index.ts` — wire `sdk.admin.experienceTypes`
  - `apps/medusa/src/admin/hooks/experience-types.ts` — React Query hooks
  - `apps/medusa/src/admin/routes/experience-types/**` — list, `[id]` edit, form components, `schemas.ts`
  - `apps/medusa/src/admin/overrides/menu.config.ts` — add `/experience-types` to `add` (with icon); add `/products` to `remove`; set `order` so Experiences follows Menus
  - Chef event edit form — experience type selector loads catalog; sets both `experience_type_id` and `eventType` (name) on save
- **Dependencies:** Task 2.
- **Acceptance criteria:**
  - CRUD works end-to-end from UI; no `workflow_event_type` selector.
  - Experiences in main sidebar (not under Extensions); Products removed.
  - Chef event edit shows catalog-sourced experience types, not a fixed enum dropdown.
  - Admin form: dollar input for price, hours for duration, 12h for time slots.

#### Task 5: Storefront server helpers, pages, seed

- **Objective:** Single API-driven source for homepage + request; seed defaults.
- **Impacted modules/files (expected):**
  - `apps/storefront/libs/util/server/data/experience-types.server.ts` (new)
  - `apps/storefront/app/routes/_index.tsx` — loader fetches experience types
  - `apps/storefront/app/components/chef/ExperienceTypes.tsx` — accept props from loader
  - `apps/storefront/app/routes/request._index.tsx` — loader fetches experience types; schema has `experienceTypeId`; `eventType` is `z.string()`; action passes `experience_type_id`
  - `apps/storefront/app/components/event-request/EventTypeSelector.tsx` — render from loader data; selection value = catalog **id**; each option uses a unique key; no `useEffect` for defaults — use `defaultValues` in parent form
  - `apps/storefront/app/components/event-request/EventRequestForm.tsx` — pass `experienceTypes` to selector; set default values for `eventType` and `experienceTypeId`
  - `apps/storefront/libs/util/server/data/chef-events.server.ts` — `experience_type_id` in DTO
  - `apps/medusa/src/scripts/seed/experience-types.ts` (new) + `apps/medusa/src/scripts/init.ts` — seed default rows (no `workflow_event_type` in seed data)
- **Dependencies:** Tasks 2-3.
- **Acceptance criteria:**
  - Homepage and request page show same seeded catalog after migrate + seed.
  - Successful submit creates chef event with `experience_type_id` set and `eventType` = experience name.
  - Selecting between different experiences works correctly in the selector.

#### Task 6: Email label resolution + subscriber updates

- **Objective:** Emails and admin display show the **catalog name** (e.g. "Catering") instead of old enum codes. ~~Pricing in subscribers is unchanged.~~ (Subscriber pricing updated in Task 7.)
- **Impacted modules/files (expected):**
  - `apps/medusa/src/lib/chef-event-email-display.ts` (new) — `resolveChefEventTypeEmailLabel()` loads catalog row by `experience_type_id`; falls back to `eventType` string on the event
  - All subscribers: `chef-event-requested.ts`, `chef-event-accepted.ts`, `chef-event-rejected.ts`, `chef-event-email-resend.ts`, `chef-event-receipt.ts` — use the resolver for the **event type label only**; subscriber pricing updated in Task 7
- **Dependencies:** Tasks 1, 3.
- **Acceptance criteria:**
  - Email `event_type` field shows catalog name, not an enum code.
  - ~~Subscriber pricing logic unchanged~~ — see Task 7.

#### Task 7: `menu_experience_price` model, migration, admin API + UI

- **Objective:** Allow the chef to set **per-person pricing for each experience type on each menu**. This creates a pricing matrix: Menu × Experience Type → price per person (in cents). Deprecates `PRICING_STRUCTURE` / `FALLBACK_PRICING` constants and the `experience_type.price_per_unit` field.
- **Data model — `menu_experience_price` (new entity in menu module):**
  - `id` — primary key
  - `menu_id` — FK → `menu.id`, `ON DELETE CASCADE`
  - `experience_type_id` — FK → `experience_type.id`, `ON DELETE CASCADE`
  - `price_per_person` — `model.bigNumber()` (stored in **cents**, e.g. 9900 = $99.00)
  - `created_at`, `updated_at` — timestamps
  - **Unique constraint** on `(menu_id, experience_type_id)` — one price per combination
- **Impacted modules/files (expected):**
  - `apps/medusa/src/modules/menu/models/menu-experience-price.ts` (new) — define the model
  - `apps/medusa/src/modules/menu/models/menu.ts` — add `hasMany` → `menu_experience_prices` (cascade delete)
  - `apps/medusa/src/modules/menu/service.ts` — register `MenuExperiencePrice` in `MedusaService`; add helper `listMenuPricing(menuId)` and `getMenuExperiencePrice(menuId, experienceTypeId)`
  - `apps/medusa/src/modules/menu/index.ts` — export new model
  - `apps/medusa/src/modules/menu/migrations/*.ts` — create `menu_experience_price` table + unique index
  - `apps/medusa/src/api/admin/menus/[id]/pricing/route.ts` (new) — **GET**: list all `menu_experience_price` rows for a menu; **POST/PUT**: upsert pricing rows (array of `{ experience_type_id, price_per_person }`)
  - `apps/medusa/src/sdk/admin/admin-menus.ts` — add `AdminMenuExperiencePriceDTO`, `AdminUpsertMenuPricingDTO`; add `listPricing(menuId)` and `upsertPricing(menuId, data)` methods
  - `apps/medusa/src/admin/hooks/menus.ts` — add `useAdminListMenuPricing` query and `useAdminUpsertMenuPricing` mutation
  - `apps/medusa/src/admin/routes/menus/components/menu-pricing-tab.tsx` (new) — a **"Pricing"** tab on the menu edit form showing a table/grid of experience types with price inputs (dollar display, cents storage). Chef can set per-person price for each active experience type. Empty = not offered on this menu.
  - `apps/medusa/src/admin/routes/menus/components/menu-form.tsx` — add "Pricing" tab alongside General / Courses / Media
  - `apps/medusa/src/admin/routes/menus/schemas.ts` — add pricing schema (array of `{ experience_type_id, price_per_person }`)
- **Dependencies:** Tasks 1 (experience type module), 4 (admin SDK/hooks).
- **Acceptance criteria:**
  - Chef can navigate to a menu's edit page and see a **Pricing** tab.
  - Pricing tab lists all active experience types with a dollar input for per-person price.
  - Chef can set prices (e.g. Buffet Style = $99.00, Cooking Class = $125.00, Meal Prep = $110.00) and save.
  - Prices stored in cents in `menu_experience_price`.
  - Unique constraint prevents duplicate (menu, experience type) rows.
  - Deleting a menu cascades to pricing rows. Deleting an experience type cascades to its pricing rows.

#### Task 8: Store API — expose menu pricing for storefront

- **Objective:** The storefront needs to know the price for a given menu + experience type combination to display estimated totals and submit correct pricing with requests.
- **Impacted modules/files (expected):**
  - `apps/medusa/src/api/store/menus/route.ts` — extend GET to include `menu_experience_prices` in relations (or add a `?include_pricing=true` query param)
  - `apps/medusa/src/api/store/menus/[id]/route.ts` — include `menu_experience_prices` in relations
  - `apps/medusa/src/sdk/store/store-menus.ts` — add `StoreMenuExperiencePriceDTO` type; update `StoreMenuDTO` to include optional `menu_experience_prices` array
  - Optionally: `apps/medusa/src/api/store/menus/[id]/pricing/route.ts` (new) — dedicated GET endpoint returning `{ prices: MenuExperiencePrice[] }` for a single menu
- **Dependencies:** Task 7.
- **Acceptance criteria:**
  - Store menu list/detail responses include pricing data.
  - Storefront can determine the per-person price for any menu × experience type combination.

#### Task 9: Storefront request flow — use menu × experience pricing

- **Objective:** When a customer builds a request (selects experience type + menu + party size), the storefront displays the correct estimated price from the `menu_experience_price` matrix. On submission, the server resolves the authoritative price and persists it as `totalPrice`.
- **Impacted modules/files (expected):**
  - `apps/storefront/libs/util/server/data/menus.server.ts` — add helper to fetch menu with pricing, or fetch pricing for a specific menu + experience type
  - `apps/storefront/app/routes/request._index.tsx` — loader fetches menus with pricing; passes to form components
  - `apps/storefront/app/components/event-request/EventRequestForm.tsx` — pass menus (with pricing) to child components; compute estimated total from menu × experience selection
  - `apps/storefront/app/components/event-request/PartySizeSelector.tsx` — use menu × experience price for per-person estimate instead of `PRICING_STRUCTURE`
  - `apps/storefront/app/components/event-request/RequestSummary.tsx` — display total from menu × experience price
  - `apps/storefront/libs/constants/pricing.ts` — deprecate `PRICING_STRUCTURE`, `FALLBACK_PRICING`; keep `legacyPricingKeyFromSlug` only as last-resort fallback; add `getMenuExperiencePrice(menus, menuId, experienceTypeId)` helper
  - `apps/storefront/libs/util/server/data/chef-events.server.ts` — `calculateEventPrice` uses menu × experience lookup; falls back to legacy only if no pricing row found
  - `apps/medusa/src/api/store/chef-events/route.ts` — POST: when `experience_type_id` **and** `templateProductId` (menu id) are present, look up `menu_experience_price` for authoritative pricing; fall back to `experience_type.price_per_unit` → legacy if not found
  - `apps/medusa/src/lib/chef-event-legacy-pricing.ts` — keep as fallback only; add JSDoc marking it deprecated
- **Dependencies:** Tasks 7, 8, 5.
- **Acceptance criteria:**
  - Customer selects "Cooking Class" experience + "Chef's Table" menu + 8 guests → sees $125 × 8 = $1,000 estimate.
  - Changing experience to "Buffet Style" (same menu) → sees $99 × 8 = $792 estimate.
  - Changing to a menu with different pricing → price updates accordingly.
  - If a menu has no pricing for the selected experience type, show a sensible fallback or "pricing not available" state.
  - On submit, server resolves the **authoritative** price from `menu_experience_price` and persists `totalPrice`.

#### Task 10: Workflow + subscriber + accept pricing updates

- **Objective:** Ensure `accept-chef-event` workflow, all email subscribers, and the booking link product price all use the stored `totalPrice` (now derived from menu × experience pricing). Deprecate hardcoded pricing maps.
- **Impacted modules/files (expected):**
  - `apps/medusa/src/workflows/accept-chef-event.ts` — `calculatePricePerPerson` already prefers `chefEvent.totalPrice / partySize`; verify this still works correctly; remove legacy `PRICING` map as the stored `totalPrice` is now authoritative
  - `apps/medusa/src/workflows/create-chef-event.ts` — verify `totalPrice` passed through correctly from store POST
  - Subscribers: `chef-event-requested.ts`, `chef-event-accepted.ts`, `chef-event-receipt.ts`, `chef-event-email-resend.ts` — replace `fallbackPricePerPersonFromStrings` usage with `chefEvent.totalPrice / partySize` (the stored total is now the authoritative source); keep legacy helper only as a last-resort fallback for old events
  - `apps/medusa/src/lib/chef-event-legacy-pricing.ts` — mark all exports as `@deprecated`; keep for backward compatibility with pre-migration events only
- **Dependencies:** Task 9.
- **Acceptance criteria:**
  - When a chef event is accepted, the product/booking-link price matches the `totalPrice` stored at request time (which came from menu × experience pricing).
  - Email estimates match the stored `totalPrice`.
  - No hardcoded per-person pricing maps in active code paths (only in deprecated legacy fallback).
  - Old events (created before this change) with `totalPrice` already set continue to work.

---

### Phase 2 backlog (not in v1 tasks)

- `product_based` flows; storefront product selector; pickup flows (new columns, storefront UX); relax admin API for `product_based` and `is_product_based`.
- Remove deprecated `chef-event-legacy-pricing.ts` after all historical events have been migrated or are no longer relevant.
- Consider a migration script to backfill `totalPrice` on old events based on menu × experience pricing (if menus and experience types can be retroactively matched).

---

### Implementation guidance

- **From `.cursor/rules/medusa-development.mdc`:** Use `MedusaService` factory for CRUD; `MedusaError` for not-found; Zod at API boundaries; module registration in `medusa-config`.
- **From `.cursor/rules/remix-storefront-routing.mdc`:** Load catalog in **loaders**; keep forms using `remix-hook-form` / validated form data patterns already on `request._index.tsx`.
- **From `.cursor/rules/typescript-patterns.mdc`:** Prefer strict typing for DTOs shared between server client and forms; avoid `any` in workflow steps where types can be imported.
- **From `.cursor/rules/testing-patterns-unit.mdc` / `testing-patterns-integration.mdc`:** Add tests where harness exists; favor behavior-focused cases for Zod and pricing branches on `POST /store/chef-events`.

---

## Risks & open questions

| Item | Type | Owner | Mitigation / next step |
| --- | --- | --- | --- |
| `templateProductId` still non-nullable on model | Risk | Implementer | v1: pass empty string or placeholder only if workflow requires; consider nullable migration in phase 2 |
| Sidebar placement for Experiences | Resolved | Implementer | Done — `menu.config.ts` updated: `/experience-types` in `add`, `/products` in `remove`, order set after Menus |
| Featured / sort UX vs all actives on homepage | Question | PabloJVelez | Use `is_featured` + `sort_order` from DB; loader may pass `featured` filter for hero section |
| `accept-chef-event` workflow uses old enum for product title | Risk | Implementer | v1: workflow reads `eventType` string directly for product title; full refactor in phase 2 |
| Existing `chef_event` rows have old enum values | Migration | Implementer | Migration converts column to text; existing rows keep their old values (`cooking_class`, etc.) which remain valid as free text; no data loss |
| Menu with no pricing rows for selected experience type | UX | Implementer | Storefront should show fallback messaging or disable submission; server falls back to legacy pricing for backward compat |
| `menu_experience_price` FK to `experience_type` crosses modules | Architecture | Implementer | Use text FK (not Medusa module link) since `experience_type` lives in a separate module; cascade via DB constraint |
| Old events created before pricing refactor | Migration | Implementer | `totalPrice` is already persisted on `chef_event`; old values remain valid; no backfill needed unless re-pricing is desired |
| `experience_type.price_per_unit` deprecation | Cleanup | Implementer | Keep column for now; stop writing to it in new code; drop in a future migration after confirming no reads |

---

## Progress tracking

During implementation, use the task hub [`AGENTS.md`](.devagent/workspace/tasks/active/2026-04-11_port-experience-types-sdoa/AGENTS.md) per DevAgent instructions (checklist, progress log, key decisions).

---

## Appendices & references

- Task hub: `.devagent/workspace/tasks/active/2026-04-11_port-experience-types-sdoa/AGENTS.md`
- Research: `.devagent/workspace/tasks/active/2026-04-11_port-experience-types-sdoa/research/2026-04-11_experience-types-parity-research.md`
- Clarification: `.devagent/workspace/tasks/active/2026-04-11_port-experience-types-sdoa/clarification/2026-04-11_initial-clarification.md`
- Sibling spec: `/Users/pablo/Personal/development/sdoa/sdoa/docs/experience-types.md`
- Root agent roster: `.devagent/AGENTS.md`

---

## Change log

| Date | Change |
| --- | --- |
| 2026-04-11 | Initial plan from research + clarification; Q4 = explicit `workflow_event_type`; five v1 tasks + phase 2 backlog |
| 2026-04-13 | **v1.1 revision:** Removed `workflow_event_type` and fixed `eventType` enum entirely. `chef_event.eventType` is now free text storing the experience type name. Added Task 6 (email label resolution). Pricing logic unchanged at this point. Updated all task descriptions, acceptance criteria, scope, and risks to reflect fully dynamic experience types. Sidebar placement resolved. Added migration risk for existing rows with old enum values. |
| 2026-04-13 | **v1.2 revision:** Added Tasks 7-10 for **menu x experience type pricing**. New `menu_experience_price` join table (menu module) stores per-person pricing in cents for each menu + experience type combination. Admin gets a Pricing tab on menus. Store APIs expose pricing. Storefront request flow resolves price from the matrix. Subscribers and accept workflow use stored `totalPrice`. Hardcoded `PRICING_STRUCTURE` / `FALLBACK_PRICING` and `experience_type.price_per_unit` deprecated. Updated scope, objectives, solution principles, and technical notes throughout. |
