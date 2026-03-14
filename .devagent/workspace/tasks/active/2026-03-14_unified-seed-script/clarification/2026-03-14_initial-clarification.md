# Clarified Requirement Packet — Unified Seed Script for Project Initialization

- Requestor: PabloJVelez (Project owner)
- Decision Maker: PabloJVelez
- Date: 2026-03-14
- Mode: Task Clarification
- Status: Complete
- Related Task Hub: `.devagent/workspace/tasks/active/2026-03-14_unified-seed-script/`
- Notes: Session 1 complete; all critical questions answered.

## Task Overview

### Context
- **Task name/slug:** unified-seed-script
- **Business context:** Project has multiple seed scripts (seed.ts, seed-menus.ts, seed/products.ts, seed/reviews.ts, seed/menus.ts, create-digital-shipping.ts) inherited from lambdacurry Medusa coffee-shop starter. No single runnable script to initialize the project for success. Project serves private-chef use case; US region only; admin user needed for pmltechpile@gmail.com.
- **Stakeholders:** PabloJVelez (requestor, decision maker)
- **Prior work:** Task hub created 2026-03-14; AGENTS.md documents scope, open questions, and implementation checklist.

### Clarification Sessions
- Session 1: 2026-03-14 — In progress

---

## Clarified Requirements

*Filled incrementally as clarification progresses.*

### Scope & End Goal

**What needs to be done?**
Create a single unified seed script that resets and reseeds the project with US-only data, chef experiences only (no physical products), admin user, and relocated old scripts.

**In-scope (must-have):**
- Consolidate all seed logic into one runnable entry point
- US region only (no Canada)
- Create admin user pmltechpile@gmail.com / password!
- Product catalog: chef experiences only — remove physical/coffee products entirely
- Idempotency: **Reset and reseed** — truncate or wipe relevant data first, then seed from scratch
- Move existing scripts to `apps/medusa/src/scripts/old-scripts/`
- **Selective wipe** before seed — delete only seeded entities (regions, products, menus, orders, reviews, etc.); preserve schema and migrations

**Out-of-scope:**
- Canada region, CAD currency, Canada-specific shipping
- Physical product catalog (coffee, roasts, grind options, origin tags)

**Nice-to-have:** (pending clarification)

---

### Question Tracker

| # | Question | Status |
|---|----------|--------|
| 1 | Idempotency behavior when re-running | ✅ answered (B: Reset and reseed) |
| 2 | Product catalog: coffee replacement | ✅ answered (A: Chef experiences only) |
| 3 | Fate of existing scripts | ✅ answered (Move to "Old scripts" directory) |
| 4 | Location of "Old scripts" directory | ✅ answered (A: apps/medusa/src/scripts/old-scripts/) |
| 5 | Reset scope: full DB vs. selective wipe | ✅ answered (B: Selective wipe) |

---

## Clarification Session Log

### Session 1: 2026-03-14
**Participants:** PabloJVelez

**Questions Asked:**
1. **Idempotency behavior when re-running?** → **B.** Reset and reseed — truncate or wipe relevant data first, then seed from scratch (PabloJVelez)
2. **Product catalog: coffee replacement?** → **A.** Chef experiences only — remove physical products entirely; only menu/experience products remain (PabloJVelez)
3. **Fate of existing scripts?** → Move to a new directory "Old scripts" (PabloJVelez)
4. **Location of "Old scripts" directory?** → **A.** `apps/medusa/src/scripts/old-scripts/` — inside the existing scripts folder (PabloJVelez)
5. **Reset scope: full DB vs. selective wipe?** → **B.** Selective wipe — delete only the entities the seed creates (regions, products, menus, orders, reviews, etc.); leave schema and migrations intact (PabloJVelez)

**Unresolved Items:**
- Medusa v2 admin user creation API (deferred to devagent research)

---

---

### Technical Constraints & Requirements

**Reset behavior:**
- Selective wipe: delete only entities that the seed creates (regions, products, menus, orders, reviews, categories, tags, collections, etc.); preserve schema and migrations

**Old scripts relocation:**
- Target path: `apps/medusa/src/scripts/old-scripts/`

---

## Assumptions Log

| Assumption | Owner | Validation Required | Validation Method | Status |
| --- | --- | --- | --- | --- |
| Medusa v2 has API or workflow for admin user creation | Implementing dev | Yes | devagent research | Pending |
| Selective wipe can be implemented via module services (list + delete) in correct FK order | Implementing dev | No | Plan will detail | — |

---

## Gaps Requiring Research

### For devagent research

**Research Question 1:** How does Medusa v2 create admin users? (createUser, invite workflow, auth module?)
- Context: Unified seed must create admin pmltechpile@gmail.com / password!
- Evidence needed: Medusa v2 auth/user module API, admin invite flow
- Priority: High
- Blocks: Admin user creation step in unified script

---

## Next Steps

### Plan Readiness Assessment
**Status:** ☑ Ready for Plan | ⬜ Research Needed | ⬜ More Clarification Needed

**Rationale:** Scope, idempotency, product strategy, old scripts location, and reset behavior are clarified. Admin user creation requires research (Medusa v2 API); devagent create-plan can incorporate a research task or the plan can assume standard patterns and flag implementation discovery.

### Recommended Actions

**Handoff to devagent create-plan:**
- [ ] Provide link to this clarification packet: `.devagent/workspace/tasks/active/2026-03-14_unified-seed-script/clarification/2026-03-14_initial-clarification.md`
- [ ] Optional: Run `devagent research` first to discover Medusa v2 admin user creation, then `devagent create-plan`
- [ ] Or: Run `devagent create-plan` directly; plan can include a "discover admin user API" implementation task
