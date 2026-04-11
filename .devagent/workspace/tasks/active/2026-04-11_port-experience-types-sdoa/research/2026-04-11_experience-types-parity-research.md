# Experience types parity (private-chef-template vs SDOA)

- **Classification:** Implementation design — porting a Medusa custom module + APIs + storefront flow from a sibling repo, per internal reference doc.
- **Last Updated:** 2026-04-11
- **Storage path:** `.devagent/workspace/tasks/active/2026-04-11_port-experience-types-sdoa/research/2026-04-11_experience-types-parity-research.md`
- **Related task hub:** `.devagent/workspace/tasks/active/2026-04-11_port-experience-types-sdoa/AGENTS.md`

## Inferred problem statement

The active task hub asks to bring **experience types** (catalog of bookable experiences with admin CRUD, store APIs, chef-event linkage, workflows, and storefront integration) into **private-chef-template** to match the architecture documented in `/Users/pablo/Personal/development/sdoa/sdoa/docs/experience-types.md` and implemented under the **sdoa** monorepo.

## Assumptions

- `[INFERRED]` **SDOA** remains the canonical implementation to mirror unless this template intentionally keeps **cooking_class** as a first-class `eventType` (this repo already differs from SDOA’s enum).
- `[INFERRED]` Research may read the sibling filesystem for evidence; only **this** repo’s application code stays unchanged during research.

## Research plan (what was validated)

1. Whether an `experience-type` Medusa module and routes exist in **private-chef-template**.
2. **ChefEvent** model and store **POST /store/chef-events** behavior vs SDOA doc (fields, pricing, status codes).
3. **createChefEvent** / **acceptChefEvent** workflow inputs and pricing assumptions.
4. Storefront **request** flow: loader, DTOs, static vs API-driven experience data.
5. Whether `experience_type_id` in seed/init refers to the same concept as SDOA’s module (naming collision check).
6. Admin SDK / admin routes for experience-type management.

## Sources

| Reference | Type | Freshness | Notes |
| --- | --- | --- | --- |
| `/Users/pablo/Personal/development/sdoa/sdoa/docs/experience-types.md` | Internal sibling doc | As authored | Target architecture and file index |
| `apps/medusa/medusa-config.ts` | Repo | 2026-04-11 | Custom modules list |
| `apps/medusa/src/modules/chef-event/models/chef-event.ts` | Repo | 2026-04-11 | Schema |
| `apps/medusa/src/api/store/chef-events/route.ts` | Repo | 2026-04-11 | Store API |
| `apps/medusa/src/workflows/create-chef-event.ts` | Repo | 2026-04-11 | Workflow input shape |
| `apps/storefront/app/routes/request._index.tsx` | Repo | 2026-04-11 | Form + action |
| `apps/storefront/libs/util/server/data/chef-events.server.ts` | Repo | 2026-04-11 | Storefront DTOs |
| `apps/storefront/app/components/chef/ExperienceTypes.tsx` | Repo | 2026-04-11 | Marketing static cards |
| `apps/medusa/src/scripts/init.ts` | Repo | 2026-04-11 | Seed — product type id |
| `/Users/pablo/Personal/development/sdoa/sdoa/apps/medusa/src/modules/chef-event/models/chef-event.ts` | Sibling repo | 2026-04-11 | Reference schema |

## Findings and tradeoffs

### 1. No experience-type module or routes in this template

`medusa-config.ts` registers `menu`, `chef-event`, and `stripe-connect-account` only — **no** `./src/modules/experience-type`. Grep under `apps/medusa` for `experience-type` / `ExperienceType` finds **no** module; only seed/init uses the string `experience_type_id` in a **different** sense (below).

### 2. Chef event schema diverges materially from SDOA

| Area | private-chef-template | SDOA (reference) |
| --- | --- | --- |
| `eventType` | `cooking_class` \| `plated_dinner` \| `buffet_style` | `plated_dinner` \| `buffet_style` \| `pickup` |
| `experience_type_id` | **Absent** | Optional FK to catalog |
| Pickup / product flow | **Absent** | `selected_products`, `pickup_time_slot`, `pickup_location` |
| `templateProductId` | Required in model (non-nullable text) | Nullable (optional for pickup) |

Evidence: ```17:21:apps/medusa/src/modules/chef-event/models/chef-event.ts``` vs sibling ```13:18:/Users/pablo/Personal/development/sdoa/sdoa/apps/medusa/src/modules/chef-event/models/chef-event.ts```.

**Tradeoff:** Full parity with SDOA implies either **dropping** `cooking_class` from the enum or **extending** SDOA’s enum to include `cooking_class` everywhere (model, Zod, workflows, accept pricing, admin, storefront). That is a product decision, not a mechanical port.

### 3. Store POST chef-events: fixed pricing, no experience type resolution

Template validates `eventType` including `cooking_class`, applies a **hardcoded** `PRICING_STRUCTURE` map, and runs `createChefEventWorkflow` — no `experience_type_id`, no pickup rules, no `superRefine` for address vs pickup. Success response uses **HTTP 200** (SDOA doc cites **201** — minor inconsistency if aligning).

Evidence: ```6:50:apps/medusa/src/api/store/chef-events/route.ts```.

### 4. createChefEvent workflow matches template enums only

`CreateChefEventWorkflowInput` includes `eventType: 'cooking_class' | 'plated_dinner' | 'buffet_style'` and default durations for those three — no `experience_type_id` or pickup fields.

Evidence: ```10:48:apps/medusa/src/workflows/create-chef-event.ts```.

### 5. Storefront: static “experience” UX; no `/store/experience-types` client

- **Loader** on `request._index` loads menus only — **no** experience type list from Medusa.
- **Form** binds `eventType` to the three enums; action maps to `createChefEventRequest` without `experience_type_id`.
- **Marketing** `ExperienceTypes.tsx` and **request** `EventTypeSelector.tsx` duplicate static arrays (copy, duration, prices) that will **drift** from any future DB-backed catalog unless unified.

Evidence: ```101:144:apps/storefront/app/routes/request._index.tsx```, ```24:65:apps/storefront/app/components/event-request/EventTypeSelector.tsx```, ```26:72:apps/storefront/app/components/chef/ExperienceTypes.tsx```.

### 6. Naming collision: `experience_type_id` in seed is Medusa **product** `type_id`

In `init.ts`, `experienceTypeId` comes from `createProductTypesWorkflow` with value `'experience'` — it is passed into `seedMenuProductsUsd` as `type_id` for **menu ticket products**, **not** the custom `experience_type` table from SDOA.

Evidence: ```237:260:apps/medusa/src/scripts/init.ts``` and ```131:165:apps/medusa/src/scripts/seed/chef-experiences.ts```.

Implementers should use **distinct names** in new code/comments (e.g. `catalogExperienceTypeId` vs `productTypeId`) to avoid confusion.

### 7. Admin SDK has no experience-types resource

Under `apps/medusa/src/sdk/admin/`: `admin-chef-events`, `admin-menus`, `admin-stripe-connect`, `admin-uploads` — **no** `admin-experience-types` (SDOA adds `AdminExperienceTypesResource` per doc).

## Recommendation

1. **Treat SDOA doc as the integration blueprint** (module, migrations, admin/store routes, hooks, storefront server helpers, seed script) and **schedule an explicit decision** on `cooking_class` vs SDOA’s three-way enum before migrations are written.
2. **Phase A (lower risk):** Add `experience-type` module + APIs + admin UI + seed; add nullable `experience_type_id` on `chef_event`; extend store POST to accept optional id and **prefer** catalog `price_per_unit` when set, with **fallback** to current `PRICING_STRUCTURE` for backward compatibility and for `cooking_class` if retained.
3. **Phase B (higher risk):** Pickup / `product_based` / selected products — requires new columns, workflow changes, storefront product selector, and **accept-chef-event** pricing rules (SDOA uses zero ticket price for pickup in one path). Only after Phase A is stable.
4. **Unify storefront sources:** Either drive marketing + request UI from the same cached `fetchExperienceTypes()` result, or document intentional static “hero” subset vs full catalog.

## Repo next steps (checklist for create-plan)

- [ ] Lock enum strategy: keep `cooking_class`, adopt SDOA set only, or union both.
- [ ] List migrations needed: new `experience_type` table; `chef_event` new columns + FK; any `eventType` constraint changes for `pickup`.
- [ ] Port file tree from SDOA doc “File index” into this repo’s paths; adjust imports and module registration.
- [ ] Align store chef-events Zod schema + HTTP status with desired API contract; update `chef-events.server.ts` DTOs and `request._index` schema.
- [ ] Extend `accept-chef-event.ts` pricing map and labels for any new `eventType` values.
- [ ] Add `seed:experience-types` (or fold into main seed) and document rename of product-type `experience_type_id` in comments.
- [ ] Plan tests: API validation, workflow create, storefront loader + action (integration/e2e as per project norms).

## Risks and open questions

| Item | Type | Mitigation / next step |
| --- | --- | --- |
| Enum mismatch (`cooking_class` vs `pickup`) | Risk | Decide in clarify-task or product mission before coding |
| Product type id vs catalog id naming | Risk | Rename variables in new code; document in plan |
| Duplicate static UI vs DB catalog | Risk | Single fetch helper + optional “featured” filter |
| `[NEEDS CLARIFICATION]` Full pickup parity in v1? | Question | Task hub Open Questions — confirm with owner |

## Recommended follow-ups

- Run **`devagent create-plan`** using this packet + SDOA file index.
- If enum/product scope is unclear, run **`devagent clarify-task`** first.
