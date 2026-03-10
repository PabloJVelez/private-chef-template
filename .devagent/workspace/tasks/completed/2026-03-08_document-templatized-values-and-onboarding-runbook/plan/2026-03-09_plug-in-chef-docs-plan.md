# Document Templatized Values & Onboarding Runbook — Plan

- Owner: PabloJVelez
- Last Updated: 2026-03-09
- Status: Draft
- Related Task Hub: `.devagent/workspace/tasks/completed/2026-03-08_document-templatized-values-and-onboarding-runbook/`
- Stakeholders: PabloJVelez (owner, decision maker)

---

## PART 1: PRODUCT CONTEXT

### Summary

The product is a client template for private chefs: you swap templatized values, plug in the specific chef, and aim for a dev demo within 2 weeks of interest and a first mock order about a month out. This task does not change application code; it produces two documentation artifacts—a **Templatized Values Inventory** and a **Combined Playbook** (runbook + client onboarding checklist)—so that path is repeatable, with medium detail (file paths and key commands) and a clear “good enough” bar for the 2-week demo (branded shell, basic copy, one sample product/menu, wired checkout). Success is measured by future you being able to follow the playbook from new chef interest through local dev demo to first mock order.

### Context & Problem

- **Current state:** Mission and roadmap define the template-for-clients model and the 2-week / ~1-month targets; the codebase already has a central chef config, env templates, seed scripts, and image/copy touchpoints, but there is no single inventory of what to change or a step-by-step runbook.
- **Pain:** Each new chef risks ad-hoc discovery (where to change store name, which routes have hardcoded “Private Chef”, how to run seed, which env vars to set). That slows the 2-week demo and ~1-month first mock order.
- **Trigger:** Clarification and research are complete; the research packet ([research/2026-03-09_templatized-values-inventory.md](../research/2026-03-09_templatized-values-inventory.md)) already maps templatized values and file locations. The gap is turning that into a maintainable inventory doc and a followable playbook.

### Objectives & Success Metrics

- **Objective 1:** A single **inventory document** that lists all templatized values (branding, copy, products, config, env) with file paths and brief “what to change” notes.
- **Objective 2:** A **combined playbook** (runbook + onboarding checklist) that walks from “new chef interest” → env setup → chef identity → images → Medusa DB + seed → local dev demo → first mock order, with medium detail and notes on what the chef sees at milestones.
- **Success:** Owner can follow the playbook once to go from interest → local dev demo → first mock order and confirm it matches intent. 2-week and 1-month are soft goals (guidance only).

### Users & Insights

- **Primary user:** Future you (owner). v1 does not need to be fully beginner- or collaborator-proof; context on the repo and stack is assumed.
- **Insight:** Template policy is strict—base template only gets clearly reusable changes; everything else stays per-chef. The playbook should reflect what belongs in template vs per-client.

### Solution Principles

- **Documentation only:** No application or source code changes in this task; only new or updated Markdown under `docs/` or `.devagent/workspace/`.
- **Single end-to-end path:** One thin path (interest → 2-week demo → ~1-month mock order) rather than exhaustive per-area docs in v1.
- **Mixed perspective:** Runbook written from implementer’s perspective with short notes on what the chef sees at key milestones.
- **Local-first:** Playbook assumes local dev demo; staging is an optional extension.

### Scope Definition

- **In scope:** (1) Templatized Values Inventory doc. (2) Combined playbook (runbook + client onboarding checklist) with one end-to-end path, medium detail, file paths and key commands. (3) Playbook defines “good enough” 2-week demo (branded shell, basic copy, one product/menu, checkout wired; sandbox OK). (4) Light time guidance allowed (e.g. “by Day 3 do X”); no heavy tracking.
- **Out of scope / future:** Example filled-out “chef X” onboarding run; heavy deadline tracking; making prose fully collaborator-proof; code changes (e.g. parameterizing store name or route meta).

### Functional Narrative

**Flow: Use the playbook for a new chef**

- **Trigger:** New private-chef client interest; you want to get to a local dev demo in ~2 weeks and a first mock order ~1 month from interest.
- **Experience:** You open the combined playbook and follow steps in order: clone/copy template → env setup (both apps) → chef identity (chef-config, store name, meta) → images (hero, CTA, favicon) → Medusa DB init + seed → run storefront and backend → place a test order. At each phase the playbook calls out what the chef would see (e.g. “Chef sees: homepage with their name and hero image”). The inventory doc is the reference for “where exactly do I change X?”
- **Acceptance:** After one pass, owner confirms the sequence and level of detail are correct and the playbook is followable without guessing.

### Technical Notes & Dependencies

- **Research dependency:** All locations and touchpoints are already captured in [research/2026-03-09_templatized-values-inventory.md](../research/2026-03-09_templatized-values-inventory.md). The inventory doc can restructure and summarize that content; the playbook must reference actual repo paths and commands (e.g. `yarn run generate-env`, `yarn run medusa:init`, `yarn run seed` in apps/medusa).
- **Existing docs:** [IMAGE_REPLACEMENT_GUIDE.md](../../../../../apps/storefront/IMAGE_REPLACEMENT_GUIDE.md) and README should be cited where relevant (images, env generation).

---

## PART 2: IMPLEMENTATION PLAN

### Scope & Assumptions

- **Scope focus:** Two documentation deliverables only; no code edits.
- **Key assumptions:** Research inventory is accurate; root `generate-env` and medusa `medusa:init` / `seed` scripts remain as currently documented; v1 audience is future you.
- **Out of scope:** Implementing code changes (e.g. driving store name from chefConfig, parameterizing route meta), creating example “chef X” runs, or adding automation/scripts.

### Implementation Tasks

#### Task 1: Write the Templatized Values Inventory document

- **Objective:** Produce a single Markdown document that lists all templatized values (branding, copy, products, config, env) with file paths and one-line “what to change” notes, so the playbook and future you have a single reference.
- **Impacted Modules/Files:** New file only. Recommended path: `docs/templatized-values-inventory.md` (or `.devagent/workspace/product/templatized-values-inventory.md` if product-scoped).
- **References:** [research/2026-03-09_templatized-values-inventory.md](../research/2026-03-09_templatized-values-inventory.md), [clarification/2026-03-08_initial-clarification.md](../clarification/2026-03-08_initial-clarification.md).
- **Dependencies:** None (research already done).
- **Acceptance Criteria:**
  - Document exists at chosen path and is Markdown.
  - Covers: chef/brand identity (chef-config, store name, favicon, social), copy/meta (route-level titles, about/how-it-works), images (hero, CTA, favicon paths), navigation, products/menus (Medusa seed files and entrypoint), config/env (storefront and Medusa .env.template and key vars), and email subscriber chef name (chef-event-accepted/rejected).
  - Each item has a file path (or env name) and a brief “what to change” note.
  - Includes a short “Quick reference” or “Order of operations” (e.g. chef-config first, then env, then images, then seed).
- **Testing Criteria:** Owner review; no automated tests required for a doc.
- **Validation Plan:** Owner reads the inventory and confirms it matches the research and is usable as the reference for “where do I change X?”

#### Task 2: Write the Combined Playbook (runbook + client onboarding checklist)

- **Objective:** Produce a single Markdown document that combines (1) a step-by-step “plug in the chef” runbook and (2) a client onboarding checklist, so one end-to-end path from new chef interest → local dev demo (2-week target) → first mock order (~1-month target) is clear and followable, with medium detail (file paths and key commands) and notes on what the chef sees at milestones.
- **Impacted Modules/Files:** New file only. Recommended path: `docs/plug-in-chef-playbook.md` (or `.devagent/workspace/product/plug-in-chef-playbook.md`).
- **References:** [research/2026-03-09_templatized-values-inventory.md](../research/2026-03-09_templatized-values-inventory.md), [clarification/2026-03-08_initial-clarification.md](../clarification/2026-03-08_initial-clarification.md), [IMAGE_REPLACEMENT_GUIDE.md](../../../../../apps/storefront/IMAGE_REPLACEMENT_GUIDE.md), root and apps README for commands.
- **Dependencies:** Task 1 (inventory) can be done first so the playbook can reference “see inventory for full list”; if preferred, both can be drafted in parallel and cross-linked.
- **Acceptance Criteria:**
  - Document exists at chosen path and is Markdown.
  - Runbook sections (or equivalent flow): (1) Clone/copy template repo, (2) Env setup (both apps—copy .env.template, set STRIPE_*, MEDUSA_PUBLISHABLE_KEY, PUBLIC_MEDUSA_API_URL, STOREFRONT_URL; mention `yarn run generate-env` if applicable), (3) Chef identity (chef-config.ts, store name in root.server, root meta if needed), (4) Images (hero, CTA, favicon per IMAGE_REPLACEMENT_GUIDE or inventory), (5) Route meta (where “Private Chef” appears and how to align with chef/site name), (6) Medusa DB + seed (e.g. `yarn run medusa:init`, `yarn run seed` in apps/medusa), (7) Run apps and verify dev demo, (8) First mock order (Stripe test mode, test card, any Stripe/webhook notes).
  - Checklist is either embedded in the runbook (e.g. checkboxes per phase) or a dedicated short section so “client onboarding checklist” is clearly identifiable.
  - “Good enough” 2-week demo is stated in the playbook: branded shell (logo/colors), basic copy, at least one sample menu/product, checkout wired (sandbox OK).
  - 2-week and ~1-month are used as soft goals (guidance only); optional light time hints (e.g. “by Day 3…”) are acceptable.
  - Mixed perspective: steps written for implementer, with brief “Chef sees: …” notes at key milestones.
  - Links or references to the inventory doc and IMAGE_REPLACEMENT_GUIDE where relevant.
- **Testing Criteria:** Owner follows the playbook once (or walks through it) and confirms it is followable and matches intent.
- **Validation Plan:** Owner run-through or sign-off; no automated tests for a doc.

### Implementation Guidance

- **From `.devagent/AGENTS.md` → Storage Patterns:** Dated artifacts use `YYYY-MM-DD_<descriptor>.md`; task-scoped artifacts live under `.devagent/workspace/tasks/...`. For this task, deliverables are non-dated reference docs (inventory and playbook), so `docs/` or `.devagent/workspace/product/` with stable names is appropriate.
- **From clarification packet:** Detail level = medium (file paths and key commands); no code changes; template policy = strict (base template only clearly reusable changes); audience = future you.
- **From research packet:** Use the research’s tables and “Key path” / “Repo next steps” as the backbone for inventory structure and playbook section order; cite research in the docs.

### Release & Delivery Strategy

- **Milestone 1:** Inventory doc complete and reviewed.
- **Milestone 2:** Combined playbook complete and reviewed.
- **Gate:** Owner confirms both artifacts are usable and the playbook is followable for the intended path (interest → 2-week demo → ~1-month mock order). No rollout or deployment; docs are consumed by the owner on next chef onboarding.

---

## Risks & Open Questions

| Item | Type | Owner | Mitigation / Next Step | Due |
|------|------|--------|------------------------|-----|
| Medusa store name in DB vs storefront | Question | Implementer | Research noted store record may have a name; playbook can state “ensure store name in admin matches intent” or defer to seed/README until confirmed. | At implementation |
| Hardcoded "Chef Luis Velez" in email subscribers | Risk | Implementer | Document in inventory and playbook as “change in chef-event-accepted.ts and chef-event-rejected.ts” (or env/config if templatized later); no code change in this task. | — |
| Exact seed script names (medusa:init vs seed) | Question | Implementer | Confirmed from apps/medusa package.json: `medusa:init` (nukedb + create + migrate + sync + seed:menus + add-user), `seed` runs seed.ts. Playbook should use these. | — |

---

## Progress Tracking

Refer to the [AGENTS.md](../../AGENTS.md) file in the task directory for instructions on tracking and reporting progress during implementation.

---

## Appendices & References

- **Clarification:** [clarification/2026-03-08_initial-clarification.md](../clarification/2026-03-08_initial-clarification.md)
- **Research:** [research/2026-03-09_templatized-values-inventory.md](../research/2026-03-09_templatized-values-inventory.md)
- **Mission:** `.devagent/workspace/product/mission.md`
- **Roadmap:** `.devagent/workspace/product/roadmap.md`
- **Storefront image guide:** `apps/storefront/IMAGE_REPLACEMENT_GUIDE.md`
- **Root scripts:** `package.json` (generate-env, medusa:init); `apps/medusa/package.json` (seed, medusa:init, add-user)
