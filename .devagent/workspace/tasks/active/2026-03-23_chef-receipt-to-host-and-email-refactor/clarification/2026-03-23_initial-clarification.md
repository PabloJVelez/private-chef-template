# Clarified Requirement Packet — Chef Receipt to Host and Email Refactor (private-chef-template)

- Requestor: PabloJVelez
- Decision Maker: PabloJVelez
- Date: 2026-03-23
- Mode: Task Clarification
- Status: Complete
- Related Task Hub: `.devagent/workspace/tasks/active/2026-03-23_chef-receipt-to-host-and-email-refactor/`
- Notes: Session 1 complete. Scope, out-of-scope, and governance confirmed. Sibling codebase may be used **only** as an internal implementation reference during research/planning—**not** in customer-facing email copy.

## Task Overview

### Context

- **Task name/slug:** `2026-03-23_chef-receipt-to-host-and-email-refactor`
- **Business context:** Implement chef-send-receipt-to-host (optional tip) and refactor event-flow emails to a shared receipt-style layout in **private-chef-template**, matching the **feature behavior and structure** proven in a sibling project, while keeping all **user-facing email content** appropriate to **this** product (no references to sibling project names or internal codenames).
- **Stakeholders:** PabloJVelez (Owner, Requestor, Decision Maker)
- **Prior work:** Task hub `AGENTS.md`; internal port reference (engineers only): sibling completed task under `/Users/pablo/Personal/development/sdoa/sdoa/.devagent/workspace/tasks/completed/2026-02-23_chef-receipt-to-host-and-email-refactor/` (clarification, plan, AGENTS).

### Clarification Sessions

- Session 1: 2026-03-23 — PabloJVelez; Q1–Q3 answered; added **email copy / branding** constraint (no sibling naming in transactional emails).

---

## Clarified Requirements

### Scope & End Goal

**What needs to be done?**

- **Receipt feature:** Chef can send a receipt email to the host from admin when conditions are met, with optional tip (amount + method), following the same **implementation shape** as the reference project (model fields, workflow, subscriber, template, API, admin UI, Resend registration)—adapted to this repo’s paths and modules.
- **Email refactor:** Refactor existing event-flow emails to the same receipt-style layout as the new receipt (header, Bill To + meta, line-item body, totals where applicable, thank-you, footer).

**User-facing copy & branding (mandatory):**

- Transactional email **subject lines, body copy, footers, and any visible labels** must use **this product’s** naming/branding only. Do **not** mention the sibling project, its codename, or other internal reference repo names in emails recipients see.

**Order of work:** (1) Receipt feature end-to-end, (2) Refactor existing emails to receipt-style.

**In-scope (must-have):**

- Full receipt stack (parity with reference feature set).
- All five event-flow templates refactored to receipt-style (same set as reference clarification: chef-event-accepted, chef-event-rejected, chef-event-requested, event-details-resend, order-placed—**verify exact list** in this repo during research).

**Out-of-scope (won’t-have) — confirmed Q2-A:**

- Receipt numbering/ID system as a product feature.
- Tip analytics dashboard.
- Payment-reminder feature (as scoped out in reference task).

**Nice-to-have / deferred:** (none added in Session 1)

---

### Technical Constraints & Requirements

- Medusa v2 patterns; React Email; inline/shared styles consistent with reference receipt layout.
- Preserve current **information and send behavior** in refactored emails; layout/visual alignment is the primary change.
- Email templates must satisfy **User-facing copy & branding** above.

---

### Dependencies & Blockers

- Chef event model: `tipAmount` / `tipMethod` (or equivalent) + migration when tip-on-receipt is in scope.
- Resend module and existing send paths in this repo.
- **🔍 needs research:** Inventory and parity check—templates, admin routes, chef-event model vs reference implementation (file-level diff).

---

### Implementation Approach

- Use reference implementation plan as a **checklist**, adapted to **private-chef-template** file layout and any API differences found in research.
- Extract or share receipt layout components/styles across templates where practical.
- When porting strings, replace any placeholder or reference-only wording with **store-appropriate** copy (env-driven brand name, existing copy patterns in this repo).

---

### Acceptance Criteria & Verification

- Receipt: admin entry point + modal when eligibility rules met; send with/without tip; persistence/history behavior matches clarified reference behavior (exact rules verified in research/plan).
- Refactor: all five in-scope templates use receipt-style layout; no regression in data or send paths; React Email preview still works if present.
- **Copy:** Spot-check all updated/new templates: no sibling-project or internal codenames in visible email content.

---

## Question Tracker

| # | Question | Status |
|---|----------|--------|
| 1 | Scope parity (receipt + refactor vs subset); email copy must not reference sibling | ✅ answered |
| 2 | Out-of-scope boundaries | ✅ answered |
| 3 | Decision maker / stakeholders | ✅ answered |

---

## Assumptions Log

| Assumption | Owner | Validation Required | Validation Method | Due Date | Status |
| --- | --- | --- | --- | --- | --- |
| Decision maker is PabloJVelez | PabloJVelez | No | Q3-A | — | Validated |
| Full parity: receipt + five templates + order of work | PabloJVelez | No | Q1-A | — | Validated |
| Out-of-scope matches reference list | PabloJVelez | No | Q2-A | — | Validated |
| “No sdoa in emails” = no sibling/codename in customer-visible email content | PabloJVelez | No | Session 1 note | — | Validated |

---

## Gaps Requiring Research

### For devagent research

**Research Question 1:** Inventory diff — which Resend templates, chef-event fields, admin routes, and eligibility rules exist in **private-chef-template** vs the reference implementation?

- Context: Mechanical port and plan tasks depend on an accurate gap list.
- Evidence needed: File paths, model fields, template list confirmation (five vs different count).
- Priority: High
- Blocks: Detailed implementation plan

**Research Question 2:** Where does this repo define **brand/store name** or email footer copy today—so new/refactored templates stay consistent?

- Context: Satisfies “no sibling names in emails” with correct local branding.
- Evidence needed: Existing env vars, constants, or copy patterns in Resend module.
- Priority: Medium
- Blocks: None if defaults exist; otherwise plan must specify copy source

---

## Clarification Session Log

### Session 1: 2026-03-23

**Participants:** PabloJVelez (Owner / Decision Maker)

**1. Scope parity for this repo?** → **A** — Match reference feature set closely (full receipt + refactor five emails, receipt first then refactor), **with the constraint** that this is a different product: **do not mention anything about the sibling project in transactional emails** (customer-visible copy/branding only for this template).

**2. Out-of-scope boundaries?** → **A** — Same won’t-have list as reference clarification (no receipt numbering/ID product, no tip analytics dashboard, no payment-reminder in this task).

**3. Decision maker?** → **A** — PabloJVelez.

**Ambiguities surfaced:** None remaining for Session 1.

**Unresolved Items:** None for clarification; research questions listed above.

---

## Next Steps

### Spec / plan readiness

**Status:** ☑ Ready for plan work (after `devagent research` answers inventory/copy-source questions)

**Rationale:** Scope, out-of-scope, governance, and email-copy constraint are explicit. Research should map this repo before `devagent create-plan`.

### Recommended actions

- [x] Session 1 Q1–Q3 captured in this packet.
- [ ] Run `devagent research` (questions above).
- [ ] Run `devagent create-plan` using this packet + research.
- [ ] `devagent implement-plan` when approved.

---

## Change Log

| Date | Change | Author |
| --- | --- | --- |
| 2026-03-23 | Initial packet created; Session 1 questions issued | clarify-task workflow |
| 2026-03-23 | Q1–A (+ email branding constraint), Q2–A, Q3–A; status Complete | PabloJVelez / clarify-task |
