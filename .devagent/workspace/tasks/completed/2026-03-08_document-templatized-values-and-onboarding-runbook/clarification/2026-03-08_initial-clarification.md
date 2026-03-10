# Clarified Requirement Packet — Document Templatized Values & Onboarding Runbook

- Requestor: PabloJVelez
- Decision Maker: PabloJVelez
- Date: 2026-03-08
- Mode: Task Clarification
- Status: Complete
- Related Task Hub: `.devagent/workspace/tasks/completed/2026-03-08_document-templatized-values-and-onboarding-runbook/`

## Task Overview

### Context
- **Task name/slug:** document-templatized-values-and-onboarding-runbook
- **Business context:** Mission defines a client template for private chefs; success = dev demo in 2 weeks, first mock order ~1 month. This task produces the documentation and checklist so that flow is repeatable.
- **Stakeholders:** PabloJVelez (owner, requestor, decision maker)
- **Prior work:** Task hub AGENTS.md, mission.md, roadmap.md, guiding-questions.md

### Clarification Sessions
- Session 1: 2026-03-08 — Owner; audience, detail level, scope, perspective, demo bar, hosting, template strictness, deliverables, treatment of 2-week/1-month targets.

---

## Clarified Requirements

### Scope & End Goal

**What needs to be done?**
- Produce an **inventory document** listing all templatized values (branding, copy, products, config, env) and where they live in the repo (file paths, key commands).
- Produce a **combined playbook** that weaves together: (1) the templatized values / locations, (2) a step-by-step “plug in the chef” runbook, and (3) a client onboarding checklist. One doc that future you can follow from interest → 2-week dev demo → ~1-month first mock order.

**End state:**
- Both artifacts exist under `.devagent/workspace/` or a docs path (e.g. `docs/`); no requirement for example “chef X” runs in this task (optional follow-up).

**In-scope (must-have):**
- Templatized values inventory with file paths and brief “what to change” notes.
- Combined playbook: runbook steps + onboarding checklist, medium detail (per-area bullets, key commands), written from your perspective with notes on what the chef sees at milestones.
- “Good enough” 2-week demo defined in the playbook: branded shell (logo/colors), basic copy, at least one sample menu/product, wired checkout (sandbox OK).
- Local-first hosting assumed; staging as optional extension.

**Out-of-scope:**
- Heavy deadline tracking (2-week / 1-month are soft goals, not hard SLAs).
- Fully beginner-proof or collaborator-proof prose (v1 is for future you).
- Example filled-out onboarding run for a specific chef (optional later).

**Nice-to-have:**
- Light time guidance (e.g. “by Day 3 do X”) without heavy tracking overhead.

### Technical Constraints & Requirements

- **Format:** Markdown under repo (e.g. `docs/` or `.devagent/workspace/`); no specific tooling required.
- **Template policy:** Base template should only get changes that are clearly reusable across multiple chefs; everything else stays per-chef. The playbook should reflect this (what belongs in template vs per-client).
- **Stack:** Reflect actual repo (Medusa 2, Remix storefront, Stripe, env generation, Docker) in paths and commands.

### Implementation Approach

- **Strategy:** First inventory the codebase for templatized surfaces (branding, copy, products, config, env); then draft the thin end-to-end path and checklist; then combine into one playbook and optionally keep a separate short inventory if useful.
- **Detail level:** Medium — file paths and key commands, not every micro-step.
- **Perspective:** Mixed — your internal steps plus “what the chef sees” at each milestone.

### Acceptance Criteria & Verification

**Done when:**
- [ ] Inventory document exists and lists templatized values with locations (paths/commands).
- [ ] Combined playbook exists: runbook + onboarding checklist, one end-to-end path, medium detail.
- [ ] Playbook defines “good enough” 2-week demo (branded shell + basic copy + one product + checkout).
- [ ] 2-week and 1-month are used as soft goals (guidance, no heavy tracking).
- [ ] Future you can follow the playbook to go from new chef interest → local dev demo → first mock order.

**Verification:** Owner runs through the checklist once (or reviews it) and confirms it matches intent.

---

## Question Tracker (all answered)

1. Primary user of runbook/checklist? → ✅ Future you.
2. Detail level (first version)? → ✅ Medium (file paths + key commands).
3. Prioritize first? → ✅ Thin end-to-end path (interest → 2-week demo → ~1-month mock order).
4. Perspective? → ✅ Mixed: your steps + what the chef sees at milestones.
5. “Good enough” 2-week demo? → ✅ Branded shell + basic copy + one menu/product + checkout wired (sandbox OK).
6. Hosting for dev demo? → ✅ Local-first acceptable; staging optional later.
7. Template vs per-chef strictness? → ✅ Very strict: base template only gets clearly reusable changes; rest stays per-chef.
8. Concrete deliverables when “done”? → ✅ A + B: inventory doc and combined playbook; examples optional.
9. How tight to treat 2-week / 1-month in this task? → ✅ Soft goals; use as guidance, no heavy tracking.

---

## Assumptions Log

| Assumption | Owner | Validation Required | Validation Method |
|------------|-------|---------------------|-------------------|
| v1 runbook is for future you; collaborator-proofing can wait | PabloJVelez | No | — |
| 2-week and ~1-month are goals, not hard SLAs | PabloJVelez | No | — |
| Local dev demo is acceptable for many first conversations; staging is optional | PabloJVelez | No | — |
| Base template changes must be clearly reusable across chefs | PabloJVelez | No | — |

---

## Gaps Requiring Research

None identified. Proceeding to plan is unblocked.

---

## Clarification Session Log

### Session 1: 2026-03-08
**Participants:** PabloJVelez (owner)

**Questions Asked:**
1. Who is the primary person you want to be able to follow this runbook/checklist successfully? → **A.** Mainly future me.
2. How much detail do you want in the first version of the runbook + checklist? → **B.** Medium detail (per-area bullets with file paths and key commands).
3. For this first pass, what should we prioritize documenting first? → **E.** A thin slice covering one end-to-end path for a new chef (minimal bits from all areas).
4. For that thin end-to-end path, whose perspective should we write it from? → **C.** Mixed: internal steps in my voice, with notes about what the chef sees at each milestone.
5. When you think about the 2-week dev demo, what’s the minimum bar “good enough”? → **A.** Branded shell, basic copy, at least one sample menu/product, checkout wired (sandbox OK).
6. Where do you expect to host that dev demo for most chefs? → **D.** Not sure yet; assume “local first, optional staging” for now.
7. How strict should the runbook be about what stays in the shared template? → **A.** Very strict: base template only gets clearly reusable changes; everything else stays per-chef.
8. When the checklist says “done” for this task, what concrete artifacts do you want? → **D.** A + B: inventory doc and combined playbook; examples optional follow-ups.
9. How tight do you want the 2-week / 1-month targets treated in this task? → **B.** Soft goals: use as guidance, don’t add a lot of tracking overhead yet.

**Unresolved Items:** None.

---

## Next Steps

### Plan Readiness Assessment
**Status:** ✅ Ready for Plan

- Critical gaps addressed: Scope (inventory + combined playbook), approach (medium detail, mixed perspective, local-first), verification (artifacts exist and playbook is followable), template policy (strict), and treatment of dates (soft goals) are all clarified.
- No blockers; no research required to draft the plan.

### Recommended Actions
- [ ] Hand this clarification packet to **devagent create-plan** with link: `.devagent/workspace/tasks/completed/2026-03-08_document-templatized-values-and-onboarding-runbook/clarification/2026-03-08_initial-clarification.md`
- [ ] Plan should produce implementation steps for: (1) inventorying templatized values and locations, (2) drafting the combined playbook (runbook + onboarding checklist) with one end-to-end path.

---

## Change Log

| Date | Change | Author |
|------|--------|--------|
| 2026-03-08 | Initial clarification session; all 9 questions answered; packet finalized for create-plan | PabloJVelez |
