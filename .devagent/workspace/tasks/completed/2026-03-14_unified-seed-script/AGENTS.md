# Unified Seed Script for Project Initialization — Progress Tracker

- Owner: PabloJVelez
- Last Updated: 2026-03-14
- Status: Complete
- Task Hub: `.devagent/workspace/tasks/completed/2026-03-14_unified-seed-script/`

## Summary

Create a single, dedicated seed script that initializes the project with everything needed for a successful startup. The project is a child of the lambdacurry Medusa starter, which originated as a coffee-shop storefront—some seed scripts still contain coffee-related references (e.g., Light/Medium/Dark Roasts, grind options, Ethiopia/Colombia tags) that may need to be updated for the private-chef context. The unified script should:

- **Consolidate all seed logic** from the existing scripts: `seed.ts`, `seed-menus.ts`, `seed/products.ts`, `seed/reviews.ts`, `seed/menus.ts`, and `create-digital-shipping.ts`
- **Serve US region only** — no Canada; remove or skip Canada-specific regions, currencies, shipping, and product pricing
- **Create an admin user** with email `pmltechpile@gmail.com` and password `password!`
- Provide one runnable entry point so developers can run it to bring the project up successfully

## Agent Update Instructions
- Always update "Last Updated" to today's date (ISO: YYYY-MM-DD) when editing this file. **Get the current date by explicitly running `date +%Y-%m-%d` first, then use the output for the "Last Updated" field.**
- Progress Log: Append a new entry at the end in the form `- [YYYY-MM-DD] Event: concise update, links to files`. Do not rewrite or delete prior entries. **Use the date retrieved from `date +%Y-%m-%d` for the date portion.**
- Implementation Checklist: Mark items as `[x]` when complete, `[~]` for partial with a short note. Add new items if discovered; avoid removing items—strike through only when obsolete.
- Key Decisions: Record important decisions as `- [YYYY-MM-DD] Decision: rationale, links`. **Use the date retrieved from `date +%Y-%m-%d` for the date portion.**
- References: Keep links current to latest spec, research, and tasks. Add additional references as they are created.
- Scope: Edits here should reflect coordination/progress only; do not include application code changes. Preserve history.

## Key Decisions
- [Date] Decision: Description, rationale, links to supporting docs.

## Progress Log
- [2026-03-14] Event: Task hub created to consolidate seed scripts into a single unified initialization script; US-only region, admin user pmltechpile@gmail.com / password!, coffee references to be reviewed/updated for private-chef context.
- [2026-03-14] Event: Clarification session complete — idempotency: reset+selective wipe; product catalog: chef experiences only; old scripts → `apps/medusa/src/scripts/old-scripts/`; clarification packet at `clarification/2026-03-14_initial-clarification.md`.
- [2026-03-14] Event: Plan created at `plan/2026-03-14_unified-seed-script-plan.md` — 5 implementation tasks: relocate scripts, selective wipe, unified seed (US + chef experiences), admin user + npm scripts, documentation.
- [2026-03-14] Event: Implementation complete. Task 1: Moved seed.ts, seed-menus.ts, create-digital-shipping.ts, seed/ to old-scripts/. Task 2: Added wipe-seeded-data.ts. Task 3: Added init.ts, seed/chef-experiences.ts. Task 4: Updated package.json (init, add-user, medusa:init). Task 5: Updated plug-in-chef-playbook.md, scripts README.
- [2026-03-14] Event: Task moved to completed. Updated all status references and file paths from active/ to completed/ throughout task directory.

## Implementation Checklist
- [x] Task 1: Relocate existing scripts to `apps/medusa/src/scripts/old-scripts/` (see plan)
- [x] Task 2: Implement selective wipe logic (reverse FK order; see plan for entity list)
- [x] Task 3: Implement unified seed script `init.ts` — US-only, chef experiences only
- [x] Task 4: Wire admin user creation and init npm script (add-user → pmltechpile@gmail.com / password!)
- [x] Task 5: Update documentation (README, playbook) and remove obsolete script references

## Open Questions
- ~~How should the unified script handle idempotency?~~ → **Clarified:** Reset and reseed; selective wipe (delete seeded entities only).
- ~~What should replace coffee-specific product data?~~ → **Clarified:** Chef experiences only; remove physical products.
- ~~Fate of existing scripts?~~ → **Clarified:** Move to `apps/medusa/src/scripts/old-scripts/`.
- Which user/invite flow does Medusa v2 use for admin creation? → **Deferred to research** (devagent research).

## References
- [2026-03-14] `plan/2026-03-14_unified-seed-script-plan.md` — Implementation plan with 5 tasks, acceptance criteria, and guidance.
- [2026-03-14] `apps/medusa/src/scripts/` — All seed scripts: seed.ts (main), seed-menus.ts, seed/products.ts, seed/reviews.ts, seed/menus.ts, create-digital-shipping.ts; README describes CLI exec usage.
- [2026-03-14] `apps/medusa/src/scripts/seed.ts` — Main seed: regions (US+CA), store currencies (usd+cad), fulfillment (North America), collections (coffee roasts + Chef Experiences), products, menus, reviews.
- [2026-03-14] `apps/medusa/src/scripts/seed-menus.ts` — Menu-focused seed: US region only, fulfillment, stock location, Default + Digital sales channels, digital shipping, publishable API key, menus.
- [2026-03-14] `apps/medusa/src/scripts/seed/products.ts` — Coffee product catalog: Blends/Single Origin/Chef Experiences, grind/size options, CAD+USD pricing, Ethiopia/Colombia/Brazil tags.
- [2026-03-14] `.devagent/workspace/product/mission.md` — Product mission: private-chef template, 2-week dev demo, ~1 month first mock order; swap templatized values, plug in chef.
- [2026-03-14] `apps/medusa/src/scripts/create-digital-shipping.ts` — Standalone digital shipping profile + option; depends on regions and fulfillment sets from main seed.
- [2026-03-14] `apps/medusa/src/scripts/seed/reviews.ts` — Texas customers and review content for product reviews.

---

## Next Steps

- **Execute:** Run `devagent implement-plan` to implement the 5 tasks from `plan/2026-03-14_unified-seed-script-plan.md`.
