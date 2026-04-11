# Port Experience Types (SDOA Parity) Progress Tracker

- Owner: PabloJVelez
- Last Updated: 2026-04-11
- Status: Draft
- Task Hub: `.devagent/workspace/tasks/active/2026-04-11_port-experience-types-sdoa/`

## Summary

We implemented **experience types** and full support for them in a sibling project (**sdoa**). We need to do the same for this template repo. The authoritative reference for scope and file-level patterns is the sibling technical doc: `/Users/pablo/Personal/development/sdoa/sdoa/docs/experience-types.md` — it covers the Medusa `experience-type` module (model, migrations, service helpers), admin and store HTTP APIs, chef-event linkage (`experience_type_id`, `eventType`, pickup/product-based fields), `createChefEvent` / `acceptChefEvent` workflows, extended Admin SDK + React Query hooks + admin routes, storefront loaders and server helpers (`experience-types.server.ts`, chef-events POST payload), request-form integration, and seeding.

In **this** codebase, experience types appear partly as **static UI data** (for example `ExperienceTypes.tsx`, `EventTypeSelector.tsx`) and scripts reference `experience_type_id`, but the **end-to-end catalog module, APIs, and dynamic request flow** described in that document are not yet assumed to exist here. This task tracks closing that gap so the template matches the proven sibling architecture, adapted to this monorepo’s layout and any intentional differences discovered during research.

## Agent Update Instructions

- Always update "Last Updated" to today's date (ISO: YYYY-MM-DD) when editing this file. **Get the current date by explicitly running `date +%Y-%m-%d` first, then use the output for the "Last Updated" field.**
- Progress Log: Append a new entry at the end in the form `- [YYYY-MM-DD] Event: concise update, links to files`. Do not rewrite or delete prior entries. **Use the date retrieved from `date +%Y-%m-%d` for the date portion.**
- Implementation Checklist: Mark items as `[x]` when complete, `[~]` for partial with a short note. Add new items if discovered; avoid removing items—strike through only when obsolete.
- Key Decisions: Record important decisions as `- [YYYY-MM-DD] Decision: rationale, links`. **Use the date retrieved from `date +%Y-%m-%d` for the date portion.**
- References: Keep links current to latest spec, research, and tasks. Add additional references as they are created.
- Scope: Edits here should reflect coordination/progress only; do not include application code changes. Preserve history.

## Key Decisions

- [2026-04-11] Decision: Track experience-types parity as a dedicated task hub; implementation waits on `devagent research` / `devagent create-plan` (no application changes during scaffolding).
- [2026-04-11] Decision (clarify-task): **v1** — `eventType` stays **three** values (`cooking_class`, `plated_dinner`, `buffet_style`); **`pickup` omitted until phase 2** (Q5 B). Catalog→workflow mapping: **plan decides** explicit field vs slug convention (Q4 C). Homepage + request: **single API source** (Q3 A). Link: `clarification/2026-04-11_initial-clarification.md`.
- [2026-04-11] Decision (create-plan): **Q4 → explicit `workflow_event_type`** on `experience_type` (enum = three chef-event buckets). v1 **rejects** `product_based` / `is_product_based` in admin APIs. Server **authoritative** `eventType` when `experience_type_id` present on store POST. Five tasks + phase 2 backlog in plan doc. Link: `plan/2026-04-11_experience-types-v1-implementation-plan.md`.

## Progress Log

- [2026-04-11] Event: Created task hub and `AGENTS.md` from template; ready for research and planning against sibling `experience-types.md`.
- [2026-04-11] Event: Completed `devagent research` — artifact `research/2026-04-11_experience-types-parity-research.md` (gaps vs SDOA, `cooking_class` vs `pickup` enum decision, seed naming collision on `experience_type_id`).
- [2026-04-11] Event: Started `devagent clarify-task` — `clarification/2026-04-11_initial-clarification.md` (batch 1: enum, pickup v1, marketing vs catalog); awaiting stakeholder answers.
- [2026-04-11] Event: Clarify-task batch 1 answered — Q1 **C** (four `eventType` values incl. `pickup`), Q2 **A** (no pickup/product flow in v1), Q3 **A** (homepage + request from API). Batch 2 (workflow mapping + pickup in schema vs UX) pending.
- [2026-04-11] Event: Clarify-task **complete** — Q4 **C** (plan picks catalog→`eventType` mapping); Q5 **B** (no `pickup` in schema until phase 2; **v1 = three `eventType` values**). Packet status **Complete**; ready for `devagent create-plan`.
- [2026-04-11] Event: **`devagent create-plan`** — `plan/2026-04-11_experience-types-v1-implementation-plan.md` (Tasks 1–5: module, APIs, chef-event+POST, admin UI, storefront+seed+naming). Next: `devagent implement-plan` or explicit implementation.

## Implementation Checklist

- [x] Read `/Users/pablo/Personal/development/sdoa/sdoa/docs/experience-types.md` and map each area (module, migrations, APIs, workflows, admin UI, storefront, seed) to this repo’s paths. — See research packet mapping and SDOA file index.
- [x] Inventory this repo: `chef-event` model and store/admin routes, request route and event-request components, seed/init scripts, and any existing `experience_type` usage — note gaps vs the reference doc. — See research packet findings.
- [x] Decide scope for v1 (full parity including pickup/product-based vs phased) and document deltas in a research or plan artifact. — `clarification/2026-04-11_initial-clarification.md` (v1 three enums, no pickup in schema; phase 2 pickup).
- [ ] Implement Medusa `experience-type` module, migrations, and registration in Medusa config per reference patterns.
- [ ] Add admin and store experience-types routes; extend store chef-events POST validation, pricing, and workflow input to match reference behavior where applicable.
- [ ] Port or adapt Admin SDK resource, hooks, and admin UI routes for experience type CRUD.
- [ ] Replace or feed static storefront experience-type data with server-backed fetch (`/store/experience-types` pattern); wire request form to `experience_type_id` (v1 — no pickup fields).
- [ ] Add or extend seed script for default experience types; run migrations and verify E2E request flow.
- [ ] Add tests appropriate to touched surfaces (API, workflow, storefront) per project testing conventions.

## Open Questions

- **Resolved:** Plan chose **explicit `workflow_event_type`** on catalog model (`plan/2026-04-11_experience-types-v1-implementation-plan.md`).
- **Phase 2:** When to schedule `pickup` + SDOA-style product-based flow (not blocking v1 implementation).

## References

- [2026-04-11] `plan/2026-04-11_experience-types-v1-implementation-plan.md` — v1 implementation plan (five tasks + phase 2 backlog).
- [2026-04-11] `clarification/2026-04-11_initial-clarification.md` — Requirement clarification (complete).
- [2026-04-11] `research/2026-04-11_experience-types-parity-research.md` — Gap analysis and phased recommendation (template vs SDOA).
- [2026-04-11] `/Users/pablo/Personal/development/sdoa/sdoa/docs/experience-types.md` — Sibling technical spec for experience types (module, APIs, workflows, admin, storefront, seed); primary implementation reference.
- [2026-04-11] `.devagent/workspace/product/mission.md` — Template mission: fold proven client features back into the shared starter.
- [2026-04-11] `.devagent/workspace/memory/constitution.md` — Mission-first delivery and quality traceability for plans and implementation.
- [2026-04-11] `.devagent/AGENTS.md` — Workflow roster and standard instructions (date handling, storage, scope guardrails).
- [2026-04-11] `.devagent/workflows/new-task.md` — Task hub scaffolding workflow definition.
- [2026-04-11] `.devagent/workspace/tasks/completed/2026-03-23_chef-receipt-to-host-and-email-refactor/AGENTS.md` — Prior **sdoa** port pattern (sibling path as engineering reference, research then plan).
- [2026-04-11] `.devagent/workspace/tasks/active/2026-03-09_port-stripe-connect-and-admin-onboarding/AGENTS.md` — Sibling-project porting context (Stripe Connect); useful precedent for cross-repo alignment notes.

## Next Steps

- **`devagent review-plan`** (optional) — Walk through `plan/2026-04-11_experience-types-v1-implementation-plan.md`.
- **`devagent implement-plan`** — Execute Tasks 1–5 in order (or implement explicitly from the plan).
