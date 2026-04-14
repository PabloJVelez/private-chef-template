# Clarified Requirement Packet — Port experience types (SDOA parity)

- **Requestor:** PabloJVelez (inferred from git config)
- **Decision Maker:** PabloJVelez `[INFERRED]`
- **Date:** 2026-04-11
- **Mode:** Task Clarification
- **Status:** Complete — ready for `devagent create-plan`
- **Related task hub:** `.devagent/workspace/tasks/active/2026-04-11_port-experience-types-sdoa/`

## Task overview

### Context

- **Task name/slug:** `2026-04-11_port-experience-types-sdoa`
- **Trigger:** Port the **experience types** feature from sibling project **sdoa** into **private-chef-template**, using `/Users/pablo/Personal/development/sdoa/sdoa/docs/experience-types.md` as the technical reference.
- **Prior work:** Research packet `research/2026-04-11_experience-types-parity-research.md` documents gaps (no Medusa `experience-type` module here; `ChefEvent` differs; storefront uses static lists; seed `experience_type_id` is Medusa **product** `type_id`, not the catalog table).

### Clarification sessions

- **Session 1 (2026-04-11):** Complete — Q1–Q5 resolved (see reconciliation note for Q1 vs Q5).

---

## Question tracker

| ID | Topic | Status | Answer / notes |
| --- | --- | --- | --- |
| Q1 | `eventType` enum vs SDOA | ✅ answered (revised) | Initial **C** (add `pickup` to enum) **superseded for v1** by **Q5 B**: **`pickup` is not in schema or enums until phase 2.** **v1** `eventType` = **`cooking_class`**, **`plated_dinner`**, **`buffet_style`** only (three values, template-consistent). |
| Q2 | v1 pickup / product-based | ✅ answered | **A** — v1 = catalog + admin CRUD + store list + `experience_type_id` on requests; **no** full pickup / product-cart / `selected_products` path in v1. |
| Q3 | Homepage vs catalog | ✅ answered | **A** — **Single source of truth:** homepage and request form load from store experience-types API (filter/sort in code as needed). |
| Q4 | How new admin-defined rows map to `eventType` | ✅ answered | **C** — No stakeholder preference; **`devagent create-plan` chooses** between explicit model field (e.g. `workflow_event_type`) vs slug convention; document chosen approach in plan. |
| Q5 | `pickup` on schema vs v1 UX | ✅ answered | **B** — **Omit `pickup` from DB/schema and application enums in v1**; add `pickup` (and related columns/flows) in **phase 2** aligned with SDOA. |

---

## Dynamic catalog vs `eventType`

**Chefs add new offerings dynamically** via the **`experience_type` catalog** (admin CRUD + store API). That does **not** require new `chef_event.eventType` enum members per offering.

**`eventType`** remains a small **workflow bucket** set for pricing defaults, durations, and accept-chef-event behavior. **v1** keeps the existing three buckets; **pickup** waits for phase 2 per Q5.

**Catalog → bucket mapping:** Plan must ensure each `experience_type` row resolves to one of the three v1 `eventType` values (explicit field vs slug rules — **Q4 C**).

---

## Clarified requirements

### Scope & end goal

**In-scope (v1):**

- Medusa `experience-type` module, migrations, register in config.
- Admin + store HTTP APIs for experience types; admin UI + SDK/hooks aligned with sibling doc (adapt enums to three `eventType` buckets).
- Seed default catalog rows for **three** workflow buckets only (no pickup seed rows required in v1 unless product wants copy-only placeholders — plan decides).
- Storefront: **server-backed** list/detail; **homepage** and **request** flow share the same API (remove static duplicate arrays in `ExperienceTypes.tsx` / `EventTypeSelector` pattern).
- Extend `chef_event` with **`experience_type_id`** (FK to catalog). **`eventType` remains** `cooking_class` | `plated_dinner` | `buffet_style` (no `pickup` in v1).
- Store chef-events POST: accept `experience_type_id`; resolve pricing from catalog when possible; **fallback** to existing per–`eventType` pricing when needed.
- **Out of v1:** `pickup` enum, pickup columns, `selected_products`, pickup UX — **phase 2** per Q2 + Q5.

**Phase 2 (planned later):** Add `pickup` + SDOA-style pickup/product-based parity (migrations, workflows, storefront).

### Technical constraints & requirements

- Stack: Medusa v2 + Remix storefront; follow existing module and route patterns.
- Disambiguate naming: Medusa product `type_id` today is passed as `experience_type_id` in menu seed — avoid confusion with catalog FK; plan should rename or comment in code.

### Dependencies & blockers

- None open for v1 clarification.

### Implementation approach

- Sibling doc + sdoa code: primary reference; **strip or guard** pickup-specific paths until phase 2.
- Plan implements Q4 mapping (explicit column vs slug) with rationale.

### Acceptance criteria & verification (v1)

- Admin CRUD experience types; store lists actives; request persists `experience_type_id` and valid `eventType` ∈ three values.
- Homepage + request UI driven by API.
- Tests: API validation + chef-event create with catalog id; manual smoke admin + storefront.

---

## Assumptions log

| Assumption | Owner | Validation required | Status |
| --- | --- | --- | --- |
| PabloJVelez is decision maker | `[INFERRED]` | No | ✅ |
| SDOA doc + codebase remain reference | Task hub | No | Assumed |
| Phase 2 will add `pickup` when pickup flows ship | PabloJVelez | No | ✅ (from Q5 B) |

---

## Gaps requiring research

- None blocking v1 plan. Phase 2 may reuse existing research packet pickup sections.

---

## Clarification session log

### Session 1 — 2026-04-11

**Participants:** PabloJVelez (assumed)

**Batch 1:**

1. **Q1:** Initial **C** (four values incl. `pickup`).
2. **Q2:** **A** — no full pickup in v1.
3. **Q3:** **A** — homepage + request from API.

**Batch 2:**

4. **Q4:** **C** — plan picks mapping mechanism (explicit field vs slug convention).
5. **Q5:** **B** — omit `pickup` from schema until phase 2.

**Reconciliation:** Q5 **B** narrows v1 scope: **three** `eventType` values only; `pickup` deferred with schema. Initial Q1 **C** is not applied in v1.

---

## Next steps

**Spec / plan readiness:** ✅ **Ready for `devagent create-plan`**

**Recommended:** Run `devagent create-plan` with this packet + `research/2026-04-11_experience-types-parity-research.md` + sibling `experience-types.md`.

---

## Change log

| Date | Change |
| --- | --- |
| 2026-04-11 | Initial packet; batch 1 recorded |
| 2026-04-11 | Batch 1 answered; Q4–Q5 opened |
| 2026-04-11 | Batch 2 answered; Q1 superseded for v1 by Q5; status **Complete** |
