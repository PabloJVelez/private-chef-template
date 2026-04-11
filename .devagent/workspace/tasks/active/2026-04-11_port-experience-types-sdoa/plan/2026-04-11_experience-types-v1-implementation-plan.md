# Experience types (v1) — Implementation plan

- **Owner:** PabloJVelez
- **Last Updated:** 2026-04-11
- **Status:** Draft
- **Related task hub:** `.devagent/workspace/tasks/active/2026-04-11_port-experience-types-sdoa/`
- **Stakeholders:** PabloJVelez (Owner / Decision Maker)
- **Upstream artifacts:** `research/2026-04-11_experience-types-parity-research.md`, `clarification/2026-04-11_initial-clarification.md`
- **Engineering reference (sibling):** `/Users/pablo/Personal/development/sdoa/sdoa/docs/experience-types.md` and corresponding paths under `sdoa/apps/medusa/` (do not ship sibling codenames in customer-facing copy)

---

## PART 1: PRODUCT CONTEXT

### Summary

Private-chef-template will gain a **database-backed catalog of experience types** that chefs manage in Medusa Admin, with **store APIs** feeding both the **marketing homepage** and the **event request** flow. Each **chef event** can reference a catalog row via **`experience_type_id`**, while **`eventType`** remains one of **three** workflow buckets (`cooking_class`, `plated_dinner`, `buffet_style`). **Pickup / product-based flows** stay **out of v1** (phase 2). This matches the clarified scope and closes the gap identified in research versus the SDOA implementation.

### Context & problem

- **Current state:** No `experience-type` module; storefront uses **static** arrays in `ExperienceTypes.tsx` and `EventTypeSelector.tsx`; `POST /store/chef-events` uses fixed per–`eventType` pricing only; `chef_event` has **no** catalog FK. The name `experience_type_id` in menu seed refers to Medusa **product** `type_id`, not this catalog ([research packet](.devagent/workspace/tasks/active/2026-04-11_port-experience-types-sdoa/research/2026-04-11_experience-types-parity-research.md)).
- **Trigger:** Port proven sibling architecture so each new chef can define offerings in admin without code changes ([clarification](.devagent/workspace/tasks/active/2026-04-11_port-experience-types-sdoa/clarification/2026-04-11_initial-clarification.md)).

### Objectives & success metrics

- **Primary:** Admin CRUD for experience types; store reads active catalog; customers submit requests that persist **`experience_type_id`** and correct **`eventType`**; homepage and request UI use the **same** server-backed data.
- **Secondary:** Pricing prefers catalog **`price_per_unit`** when present; otherwise existing **`PRICING_STRUCTURE`** behavior.
- **Success (binary):** No duplicate static marketing vs request catalogs for v1; migrations apply cleanly; no `pickup` / `product_based` booking path until phase 2.

### Users & insights

- **Primary:** Developer/agency shipping the template; chefs using Medusa Admin.
- **Secondary:** Storefront visitors choosing an experience and submitting a request.
- **Insight:** Dynamic offerings come from **catalog rows**, not from growing the `eventType` enum ([clarification — dynamic vs enum](.devagent/workspace/tasks/active/2026-04-11_port-experience-types-sdoa/clarification/2026-04-11_initial-clarification.md)).

### Solution principles

- **Medusa v2** custom module + API routes + workflows — align with `.cursor/rules/medusa-development.mdc` and existing `chef-event` / `menu` modules.
- **Remix/React Router** loaders and server data helpers — align with `.cursor/rules/remix-storefront-routing.mdc` and `.cursor/rules/remix-storefront-optimization.mdc` (no client-only fetch for SEO-critical catalog content where loaders already exist).
- **Q4 resolution (plan choice):** Add explicit **`workflow_event_type`** on `experience_type` with enum `cooking_class` | `plated_dinner` | `buffet_style`. **Rationale:** Admin-visible, validate in Zod, avoids brittle slug conventions; maps 1:1 to `chef_event.eventType` for workflows and `accept-chef-event` pricing.
- **v1 guardrail:** Admin create/update **rejects** `pricing_type === 'product_based'` and `is_product_based === true` (or equivalent) until phase 2, so chefs cannot configure unsupported flows.

### Scope definition

- **In scope (v1):** `experience-type` module (model + migrations + service + `medusa-config`); admin + store HTTP routes; extended Admin SDK + hooks + admin UI; `chef_event.experience_type_id` + FK; `createChefEventWorkflow` + store POST pricing rules; storefront `experience-types.server.ts`; wire `_index` + `request._index` + event-type UI; seed script for three default rows; rename menu-seed parameter that collides with catalog naming (`productTypeId` or similar).
- **Out of scope / phase 2:** `pickup` enum; `selected_products`, pickup slots/location fields; storefront product picker; `accept-chef-event` pickup pricing; `product_based` booking.

### Functional narrative

#### Flow: Chef maintains catalog

- **Trigger:** Admin opens Experience Types extension routes.
- **Narrative:** List, create, edit, delete (soft/hard per MedusaService defaults); each row has **`workflow_event_type`** and merchandising fields aligned with SDOA model where applicable.
- **Acceptance:** Inactive rows do not appear on store list; slug unique; invalid `product_based` rejected in v1.

#### Flow: Customer browses homepage

- **Trigger:** Landing page load.
- **Narrative:** Loader fetches active experience types (same helper as request page); `ExperienceTypes` renders API-driven cards (featured/sort from DB).
- **Acceptance:** No hardcoded duplicate of catalog copy/prices for the three seeded types unless intentionally overridden in plan implementation notes.

#### Flow: Customer submits request

- **Trigger:** Request form submit.
- **Narrative:** User selects a **catalog** experience (id); payload includes **`experience_type_id`**; server resolves **`eventType`** from catalog **`workflow_event_type`** and **`totalPrice`** from catalog or fallback map.
- **Acceptance:** Created `chef_event` has consistent `eventType` + `experience_type_id`; Zod validates ids and times.

### Technical notes & dependencies

- **Migrations:** New table `experience_type`; new column `chef_event.experience_type_id` + FK `ON DELETE SET NULL` (match SDOA pattern from sibling doc).
- **Optional:** Port `raw_price_per_unit` jsonb migration from SDOA if `bigNumber` persistence requires it — mirror sibling if implementer hits serialization issues.
- **HTTP:** Prefer **`201 Created`** on successful `POST /store/chef-events` for parity with common REST expectations (research noted 200 today).

---

## PART 2: IMPLEMENTATION PLAN

### Scope & assumptions

- **Scope:** v1 only (three `eventType` values; no pickup).
- **Assumptions:** Sibling repo remains available for file-level diff; `yarn` / `medusa db:migrate` used as in repo README.
- **Out of scope:** Phase 2 pickup (documented below as future backlog).

### Implementation tasks

#### Task 1: `experience-type` Medusa module

- **Objective:** Persist catalog rows with SDOA-aligned fields plus **`workflow_event_type`** (`cooking_class` | `plated_dinner` | `buffet_style`).
- **Impacted modules/files (expected):**
  - `apps/medusa/src/modules/experience-type/models/experience-type.ts` (new)
  - `apps/medusa/src/modules/experience-type/service.ts` — extend `MedusaService`; add `listActiveExperienceTypes()`, `getBySlug(slug)` (mirror sibling)
  - `apps/medusa/src/modules/experience-type/index.ts` — module registration + `EXPERIENCE_TYPE_MODULE` token
  - `apps/medusa/src/modules/experience-type/migrations/*.ts` — create table + indexes; optional `raw_price_per_unit` per sibling
  - `apps/medusa/medusa-config.ts` — register `{ resolve: './src/modules/experience-type', options: {} }`
- **References:** Sibling `apps/medusa/src/modules/experience-type/**`; `/Users/pablo/Personal/development/sdoa/sdoa/docs/experience-types.md` § Medusa module & data model.
- **Dependencies:** None.
- **Acceptance criteria:**
  - Module loads; `medusa db:migrate` creates `experience_type` with **`workflow_event_type`** populated in model.
  - `listActiveExperienceTypes` returns `is_active` rows ordered by `sort_order`.
  - `getBySlug` returns active row or null.
- **Testing criteria:** Manual: run migrations in dev; optional unit test on service with Medusa test utils if patterns exist in repo.
- **Validation plan:** Boot Medusa; no DI errors; query table via admin or SQL.

#### Task 2: Admin and store HTTP APIs

- **Objective:** CRUD (admin) and read-only list + by slug (store), with v1 validation rules.
- **Impacted modules/files (expected):**
  - `apps/medusa/src/api/admin/experience-types/route.ts` (GET, POST)
  - `apps/medusa/src/api/admin/experience-types/[id]/route.ts` (GET, PUT, DELETE)
  - `apps/medusa/src/api/store/experience-types/route.ts` (GET → `listActiveExperienceTypes`)
  - `apps/medusa/src/api/store/experience-types/[slug]/route.ts` (GET → `getBySlug`)
- **References:** Sibling `apps/medusa/src/api/admin/experience-types/**`, `store/experience-types/**`; Zod patterns in existing `apps/medusa/src/api/**`.
- **Dependencies:** Task 1.
- **Acceptance criteria:**
  - Admin POST validates body; slug default from `slugify(name)` when omitted; **`workflow_event_type`** required.
  - v1: reject **`pricing_type: product_based`** and **`is_product_based: true`** in admin POST/PUT.
  - Store GET returns `{ experience_types: [...] }` / `{ experience_type: {...} }` shapes compatible with sibling doc.
- **Testing criteria:** Manual `curl`/HTTP client with publishable key for store; admin with session or API patterns used elsewhere.
- **Validation plan:** Hit all routes; 404 for inactive/missing slug on store detail.

#### Task 3: `chef_event` FK + workflows + store chef-events POST

- **Objective:** Link requests to catalog; resolve **`eventType`** and **pricing** from catalog when **`experience_type_id`** is present.
- **Impacted modules/files (expected):**
  - `apps/medusa/src/modules/chef-event/models/chef-event.ts` — add `experience_type_id: model.text().nullable()` (or appropriate id type per Medusa model conventions)
  - `apps/medusa/src/modules/chef-event/migrations/*.ts` — new migration for column + FK to `experience_type` (`ON DELETE SET NULL`)
  - `apps/medusa/src/workflows/create-chef-event.ts` — extend input with optional `experience_type_id`; pass through to `createChefEvents`
  - `apps/medusa/src/api/store/chef-events/route.ts` — Zod: optional `experience_type_id`; if present, load experience type, set **`eventType`** = `workflow_event_type`, compute **`totalPrice`** from `price_per_unit` × `partySize` when price set (handle bigNumber / cents like sibling), else use existing `PRICING_STRUCTURE[eventType]`; normalize empty string id → null; respond with **201** on success
  - `apps/medusa/src/api/admin/chef-events/route.ts` (and related DTOs if any) — optional: allow `experience_type_id` for parity (clarification focused on store; include if low cost)
- **References:** Sibling `apps/medusa/src/api/store/chef-events/route.ts`; research § chef-events POST; `.cursor/rules/medusa-development.mdc`.
- **Dependencies:** Tasks 1–2.
- **Acceptance criteria:**
  - Request with valid **`experience_type_id`** persists FK and **`eventType`** matches catalog **`workflow_event_type`** even if client sent a different **`eventType`** (server **authoritative** when id present).
  - Request **without** id behaves as today ( **`eventType`** + fixed pricing from body).
  - Empty id does not break validation.
- **Testing criteria:** Add or extend API/integration test if project has harness; else document manual matrix (with id / without id / invalid id / missing price on catalog).
- **Validation plan:** Create event via storefront; verify DB row in `chef_event`.

#### Task 4: Admin SDK, hooks, and admin UI

- **Objective:** Operators manage catalog from dashboard without raw HTTP.
- **Impacted modules/files (expected):**
  - `apps/medusa/src/sdk/admin/admin-experience-types.ts` (new)
  - `apps/medusa/src/sdk/admin/index.ts`, `apps/medusa/src/sdk/index.ts` — wire `sdk.admin.experienceTypes`
  - `apps/medusa/src/admin/hooks/experience-types.ts` — React Query hooks mirroring sibling
  - `apps/medusa/src/admin/routes/experience-types/**` — list, `[id]` edit, form components, `schemas.ts`
- **References:** Sibling paths listed in `experience-types.md` § Medusa Admin; existing `admin-menus` / `admin-chef-events` as style references.
- **Dependencies:** Task 2.
- **Acceptance criteria:**
  - CRUD works end-to-end from UI; **`workflow_event_type`** and v1 pricing guards visible in form validation.
- **Testing criteria:** Manual admin smoke; TypeScript passes for admin package.
- **Validation plan:** Create row, edit, deactivate, confirm store list changes.

#### Task 5: Storefront server helpers, pages, seed, naming cleanup

- **Objective:** Single API-driven source for homepage + request; seed defaults; remove naming collision in menu seed.
- **Impacted modules/files (expected):**
  - `apps/storefront/libs/util/server/data/experience-types.server.ts` (new) — `fetchExperienceTypes`, `retrieveExperienceTypeBySlug`; use `baseMedusaConfig` + publishable key; caching via `cachified` or existing storefront cache patterns (match sibling)
  - `apps/storefront/app/routes/_index.tsx` — loader fetches experience types; pass to `ExperienceTypes`
  - `apps/storefront/app/components/chef/ExperienceTypes.tsx` — accept **props** from loader (remove or gate static fallback)
  - `apps/storefront/app/routes/request._index.tsx` — loader fetches experience types + existing menus; extend `eventRequestSchema` with **`experienceTypeId`** (catalog id, required for new submissions); action builds `createChefEventRequest` payload with **`experience_type_id`**
  - `apps/storefront/app/components/event-request/EventTypeSelector.tsx` (and related) — render from **loader data**; selection value = catalog **id**
  - `apps/storefront/libs/util/server/data/chef-events.server.ts` — `StoreCreateChefEventDTO` includes optional **`experience_type_id`**; align with API
  - `apps/medusa/src/scripts/seed/experience-types.ts` (new) + `package.json` script — seed three rows if empty (`workflow_event_type` + copy/pricing aligned with current static marketing)
  - `apps/medusa/src/scripts/init.ts` + `apps/medusa/src/scripts/seed/chef-experiences.ts` — rename parameter **`experience_type_id`** → e.g. **`medusaProductTypeId`** (or `productTypeId`) wherever it refers to **product type**, update call sites and comments
  - **Audit:** `apps/storefront/app/templates/MenuTemplate.tsx` and any other static “experience type” lists — align or document intentional exception
- **References:** Sibling `experience-types.md` § Storefront; `apps/storefront/libs/util/server/client.server.ts`.
- **Dependencies:** Tasks 2–3 (store API stable).
- **Acceptance criteria:**
  - Homepage and request page show same seeded catalog after migrate + seed.
  - Successful submit creates chef event with **`experience_type_id`** set.
  - No remaining use of `experience_type_id` **variable name** for Medusa product type without clarifying comment (rename preferred).
- **Testing criteria:** `yarn typecheck` / lint for touched packages; optional component test for selector if project uses RTL for storefront.
- **Validation plan:** Full browser path: load home → request → submit → success URL shows new id.

---

### Phase 2 backlog (not in v1 tasks)

- Add `pickup` to `chef_event.eventType` and SDOA pickup columns; `product_based` flows; storefront product selector; `accept-chef-event` pickup pricing rules; relax admin API guard for `product_based`.

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
| `bigNumber` / cents conversion for `price_per_unit` | Risk | Implementer | Mirror sibling store route conversion; add `raw_price_per_unit` migration if needed |
| `templateProductId` still non-nullable on model | Risk | Implementer | v1: pass empty string or placeholder only if workflow requires; consider nullable migration in phase 2 |
| Admin route menu entry for experience types | Question | Implementer | Follow existing `menu.config.ts` / unlock overrides pattern if extension routes are not auto-listed |
| Featured / sort UX vs all actives on homepage | Question | PabloJVelez | Use `is_featured` + `sort_order` from DB; loader may pass `featured` filter for hero section |

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
