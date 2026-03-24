# Chef Receipt to Host and Receipt-Style Email Refactor — Implementation Plan

- Owner: PabloJVelez
- Last Updated: 2026-03-23
- Status: Draft
- Related Task Hub: `.devagent/workspace/tasks/active/2026-03-23_chef-receipt-to-host-and-email-refactor/`
- Stakeholders: PabloJVelez (Owner / Decision Maker)
- Notes: **Phase A** — receipt feature end-to-end. **Phase B** — shared layout + refactor five templates. Repository inventory folded into this plan (no separate research packet). Customer-facing copy must follow `clarification/2026-03-23_initial-clarification.md` (no internal/sibling codenames in emails).

---

## PART 1: PRODUCT CONTEXT

### Summary

Chefs need to send a **receipt email to the host** after a confirmed, ticketed event when the event date has passed or all tickets are sold, with **optional tip** (amount + method) for expense documentation. All **five** existing chef/order transactional emails should share a **unified receipt-style** layout (header, Bill To + meta, line-item body, totals where applicable, thank-you, footer) so communications look consistent and professional. Work order: ship the receipt feature first, then refactor templates.

### Context & Problem

- **Current state (this repo, 2026-03-23):**
  - Templates: `apps/medusa/src/modules/resend/emails/` — `chef-event-accepted.tsx`, `chef-event-rejected.tsx`, `chef-event-requested.tsx`, `event-details-resend.tsx`, `order-placed.tsx` (five files; **no** `receipt.tsx`).
  - Resend service: `apps/medusa/src/modules/resend/service.ts` — `Templates` enum maps exactly those five; no receipt entry.
  - Chef event model: `apps/medusa/src/modules/chef-event/models/chef-event.ts` — has `emailHistory`, `lastEmailSentAt`, `productId`, etc.; **no** `tipAmount` / `tipMethod`.
  - Admin GET: `apps/medusa/src/api/admin/chef-events/[id]/route.ts` returns `chefEvent` only — **no** `availableTickets`.
  - Resend workflow pattern: `apps/medusa/src/workflows/resend-event-email.ts` + event `chef-event.email-resend`; subscribers under `apps/medusa/src/subscribers/` (e.g. `chef-event-accepted.ts`).
- **Clarified requirements:** Full parity with the reference feature set (see task clarification); out-of-scope: receipt numbering product, tip analytics dashboard, payment-reminder in this task.

### Objectives & Success Metrics

- **Primary:** From admin, chef can send a receipt to the host when preconditions hold, with optional tip; history and tip fields persist.
- **Secondary:** All five existing emails + new receipt use shared receipt-style layout and styling.
- **Success:** Button visibility and validation match clarification; no regression in send behavior or data; subjects/body/footer use **this product’s** branding only.

### Users & Insights

- **Primary:** Chefs using Medusa admin for chef events.
- **Secondary:** Hosts receiving receipts and existing transactional emails.
- **Insight:** Tip is often recorded after the event; optional amount + method (cash / electronic / other) should match the reference UX pattern.

### Solution Principles

- Mirror proven Medusa v2 patterns already in-repo: **workflow** → **emitEventStep** → **subscriber** → **notification** with template key (same shape as `resend-event-email` / `chef-event-accepted`).
- Receipt layout: header bar, Bill To + receipt meta, line items, totals, thank-you, footer — align colors/typography with the reference receipt spec from the external implementation plan (engineering reference only; **do not** surface reference project names in email HTML/text).
- **Copy:** Reuse or extend existing subject lines in `service.ts` as patterns; centralize store/chef name from existing email data or env where appropriate — **no** sibling or internal codenames in customer-visible strings.

### Scope Definition

- **In scope:** `tipAmount` / `tipMethod` + migration; `send-receipt` workflow; `chef-event.receipt` subscriber; `receipt` React Email template; POST `admin/chef-events/[id]/send-receipt`; SDK + admin hook; `availableTickets` on GET detail when `productId` set; Resend template registration; admin UI (button + tip modal + duplicate-send warning); extract shared receipt layout; refactor all **five** listed templates.
- **Out of scope:** Dedicated receipt ID/numbering product, tip analytics dashboard, payment-reminder feature, rollout/comms tasks.

### Functional Narrative

#### Flow: Send receipt (optional tip)

- **Trigger:** Chef clicks **Send Receipt** on chef event detail in admin.
- **Preconditions:** `status === 'confirmed'`, `productId` set, and (**event date** has passed, date-only comparison) **or** `availableTickets === 0`.
- **Experience:** Modal: optional tip amount; method (e.g. cash vs Venmo/Zelle/PayPal/Other + custom text when needed). If `emailHistory` already contains `type === "receipt"`, show confirm/warning. Submit runs workflow; host receives email; history gains `receipt` entry; tip fields updated when provided.
- **Validation:** Tip amount non-negative when provided; if amount > 0, method required (per clarification reference).

#### Flow: Receipt-style emails

- **Trigger:** Existing sends for the five templates (unchanged triggers).
- **Experience:** Same data and recipients; layout/styling aligned with receipt template via shared components/styles.
- **Acceptance:** Named + default exports preserved for React Email preview (`yarn dev:email` in `apps/medusa` per existing task).

### Technical Notes & Dependencies

- **Inventory:** Compute `availableTickets` as aggregate **stocked − reserved** across product variant inventory levels at the **same digital stock location** used when accepting events — follow steps in `apps/medusa/src/workflows/accept-chef-event.ts` (`Modules.INVENTORY`, `listInventoryLevels`, `digitalLocation`). If product has multiple variants, sum availability across variants (match reference plan semantics).
- **emailHistory `type`:** Use string `"receipt"` for the new entry (consistent with reference plan).
- **Migrations:** New migration under `apps/medusa/src/modules/chef-event/migrations/` following existing files (e.g. `add-acceptance-fields.ts` pattern).

---

## PART 2: IMPLEMENTATION PLAN

### Scope & Assumptions

- **Scope:** Phase A (receipt) then Phase B (layout + refactor).
- **Assumptions:** Subscriber auto-discovery continues to pick up new files under `apps/medusa/src/subscribers/` (verify if a registry exists; Medusa v2 default is convention-based).
- **Evidence gap:** If `availableTickets` computation differs from production expectations, adjust in implementation and document in AGENTS progress log.

### Phase A — Receipt feature (Tasks A1–A5)

#### Task A1: Tip fields on chef event + types

- **Objective:** Persist optional tip on chef event; expose in admin DTOs.
- **Impacted modules/files:**
  - `apps/medusa/src/modules/chef-event/models/chef-event.ts` — add `tipAmount` (number, nullable), `tipMethod` (text, nullable); extend exported `ChefEventType`.
  - `apps/medusa/src/modules/chef-event/migrations/` — new migration: `tip_amount` (numeric), `tip_method` (text), reversible `down`.
  - `apps/medusa/src/sdk/admin/admin-chef-events.ts` — `AdminChefEventDTO` (+ update DTOs if needed) with optional `tipAmount`, `tipMethod`.
- **References:** Clarification packet; existing migrations in same folder.
- **Dependencies:** None.
- **Acceptance criteria:** Model and DB aligned; SDK types compile; migration up/down succeeds locally.
- **Testing criteria:** Run migration; `yarn` typecheck for `apps/medusa` (or monorepo script used by project).
- **Validation plan:** Migration run + TypeScript.

#### Task A2: GET chef event detail + `availableTickets`

- **Objective:** When `productId` is set, include `availableTickets` on GET response for admin UI gating.
- **Impacted modules/files:**
  - `apps/medusa/src/api/admin/chef-events/[id]/route.ts` — after `retrieveChefEvent`, if `productId`, resolve product variants, inventory module, digital location (reuse logic consistent with `accept-chef-event.ts`), compute sum of `(stocked_quantity - reserved_quantity)` (or equivalent API) across relevant levels; attach `availableTickets` to JSON payload (number; use `0` if no levels).
  - `apps/medusa/src/sdk/admin/admin-chef-events.ts` — `availableTickets?: number` on `AdminChefEventDTO`.
- **References:** `apps/medusa/src/workflows/accept-chef-event.ts` (inventory + `digitalLocation`).
- **Dependencies:** None (orthogonal to A1).
- **Acceptance criteria:** Confirmed event with `productId` returns numeric `availableTickets`; events without product omit or send `0` per chosen convention (document in code comment).
- **Testing criteria:** Manual GET or integration call with seeded event + inventory.
- **Validation plan:** Manual/API test.

#### Task A3: Send-receipt workflow + subscriber + receipt template + Resend registration

- **Objective:** End-to-end send pipeline for template key `receipt`.
- **Impacted modules/files:**
  - `apps/medusa/src/workflows/send-receipt.ts` (new) — input: `chefEventId`, optional `recipients`, `notes`, `tipAmount`, `tipMethod`; step: append `emailHistory` entry type `receipt`, update `lastEmailSentAt`, persist tip fields when provided; `emitEventStep` `chef-event.receipt` with payload for subscriber.
  - `apps/medusa/src/subscribers/chef-event-receipt.ts` (new) — listen for `chef-event.receipt`; load chef event + product; build payload (mirror field shape used by `chef-event-accepted.ts` where applicable + receipt-specific fields); `createNotifications` with template `receipt`.
  - `apps/medusa/src/modules/resend/emails/receipt.tsx` (new) — React Email; `export default` + named export for Resend; `PreviewProps` for `dev:email`; props aligned with subscriber payload; optional gratuity line; **copy** uses generic/store-appropriate wording only.
  - `apps/medusa/src/modules/resend/service.ts` — add `RECEIPT` to enum, import template, `templates` map, `getTemplateSubject` case (e.g. “Your receipt” / store-appropriate — no internal codenames).
- **References:** `resend-event-email.ts`, `chef-event-accepted.ts`, sibling plan Tasks 3–5, 8 (behavioral spec).
- **Dependencies:** A1 (tip persistence), A2 optional for subscriber pricing/tickets (subscriber can recompute from product + orders as existing emails do).
- **Acceptance criteria:** Workflow runs; event fires; notification uses template `receipt`; email renders with/without tip.
- **Testing criteria:** Trigger workflow in dev; inspect Resend/logs; preview `receipt.tsx`.
- **Validation plan:** Preview server + one manual send.

#### Task A4: POST send-receipt API + SDK + hook

- **Objective:** Admin API and client hook for sending receipt.
- **Impacted modules/files:**
  - `apps/medusa/src/api/admin/chef-events/[id]/send-receipt/route.ts` (new) — Zod body: optional `recipients`, `notes`, `tipAmount`, `tipMethod`; validate chef event exists, `productId`, `status === confirmed`; tip rules; default recipients to host `chefEvent.email`; run `sendReceiptWorkflow` (name TBD — align with file); map errors to 400/404.
  - `apps/medusa/src/sdk/admin/admin-chef-events.ts` — `AdminSendReceiptDTO`, `sendReceipt(id, data)`.
  - `apps/medusa/src/admin/hooks/chef-events.ts` — `useAdminSendReceiptMutation` invalidating `['chef-events', id]`.
- **References:** `apps/medusa/src/api/admin/chef-events/[id]/resend-email/route.ts`.
- **Dependencies:** A3.
- **Acceptance criteria:** Valid POST succeeds; invalid tip/event returns correct status; hook refreshes detail query.
- **Testing criteria:** API-level tests if project has pattern; else manual.
- **Validation plan:** Manual from admin after A5.

#### Task A5: Admin UI — button, modal, conditions

- **Objective:** Chef event detail page exposes Send Receipt UX.
- **Impacted modules/files:**
  - `apps/medusa/src/admin/routes/chef-events/[id]/page.tsx` — `hasEventTakenPlace` (date-only vs `requestedDate`), `availableTickets` from retrieve; show button when `confirmed && productId && (hasEventTakenPlace || availableTickets === 0)`; modal + `useAdminSendReceiptMutation`; toast; warn if receipt already in `emailHistory`.
- **References:** Clarification; existing sections on same page (accept/reject, email management).
- **Dependencies:** A2, A4.
- **Acceptance criteria:** Visibility matches rules; duplicate-send warning; success/error feedback.
- **Testing criteria:** Manual on seeded event.
- **Validation plan:** Manual QA checklist in AGENTS.

### Phase B — Shared layout + template refactor (Tasks B1–B2)

#### Task B1: Extract shared receipt layout / styles

- **Objective:** Shared primitives (header, Bill To + meta, line items, totals, thank-you, footer, style tokens) used by `receipt.tsx` without changing its appearance.
- **Impacted modules/files:**
  - `apps/medusa/src/modules/resend/emails/` — e.g. `receipt-layout.tsx` and/or `receipt-styles.ts` (names flexible); refactor `receipt.tsx` to consume them.
- **References:** Receipt template from A3; sibling plan Task 10 (structure).
- **Dependencies:** A3 complete enough to freeze layout.
- **Acceptance criteria:** Receipt email visually unchanged in preview; shared module exported for reuse.
- **Testing criteria:** `yarn dev:email` before/after screenshot or eyeball.
- **Validation plan:** Preview server.

#### Task B2: Refactor five existing templates to receipt-style

- **Objective:** Each of the five templates adopts shared layout; **data props and named exports** unchanged for `service.ts`.
- **Impacted modules/files:**
  - `apps/medusa/src/modules/resend/emails/chef-event-accepted.tsx`
  - `apps/medusa/src/modules/resend/emails/chef-event-rejected.tsx`
  - `apps/medusa/src/modules/resend/emails/chef-event-requested.tsx`
  - `apps/medusa/src/modules/resend/emails/event-details-resend.tsx`
  - `apps/medusa/src/modules/resend/emails/order-placed.tsx`
- **References:** Task B1; current markup per file; clarification (no copy regression, layout-only).
- **Dependencies:** B1.
- **Acceptance criteria:** All five render in preview; subscribers still pass same data; Resend sends succeed for each flow type.
- **Testing criteria:** Preview each template; trigger at least one subscriber path per type if feasible.
- **Validation plan:** Preview + spot-check sends.

### Implementation Guidance

- **From `.cursor/rules/medusa-development.mdc`:** Validate admin routes with Zod; use `MedusaError` types where appropriate; workflows/subscribers follow existing Medusa v2 patterns.
- **From `.cursor/rules/typescript-patterns.mdc`:** Prefer strict typing for workflow input DTOs and API bodies; avoid `any` in new code where straightforward.
- **From task clarification:** No sibling/internal project names in **customer-visible** email strings (subject, HTML body, footers).

### Release & Delivery Strategy (Optional)

- Land Phase A behind no feature flag unless product requires it; Phase B is visual-only refactor — deploy together or immediately after A to avoid layout drift.

---

## Risks & Open Questions

| Item | Type | Owner | Mitigation / Next Step | Due |
| --- | --- | --- | --- | --- |
| `availableTickets` vs multi-variant / multi-location edge cases | Risk | Implementer | Match `accept-chef-event` stock location; document formula in code; adjust if QA finds mismatch | Implementation |
| Digital location resolution duplicated in GET vs workflow | Risk | Implementer | Extract small helper in shared util if duplication grows | Optional refactor |
| No dedicated research packet | Question | PabloJVelez | This plan includes repo inventory; proceed or run `devagent research` for deeper diff vs external repo | Before implement |

---

## Progress Tracking

Use `.devagent/workspace/tasks/active/2026-03-23_chef-receipt-to-host-and-email-refactor/AGENTS.md` — Implementation Checklist, Progress Log, Key Decisions.

---

## Appendices & References

- `clarification/2026-03-23_initial-clarification.md` — scope, out-of-scope, copy constraint, governance.
- `AGENTS.md` (task hub) — summary and decisions.
- Engineering reference (behavioral checklist, **not** for email copy): external path cited in task hub sibling `plan/2026-02-23_chef-receipt-and-email-refactor-implementation-plan.md`.
- Repository snapshots (2026-03-23): `service.ts` Templates enum; five email files; `chef-event` model; `resend-event-email.ts`; `chef-events/[id]/route.ts`; `admin-chef-events.ts`.

## Change Log

| Date | Change |
| --- | --- |
| 2026-03-23 | Initial plan from clarification + repo inventory |
