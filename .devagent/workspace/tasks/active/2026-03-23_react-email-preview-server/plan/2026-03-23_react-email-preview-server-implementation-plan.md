# React Email Preview Server — Implementation Plan

- Owner: PabloJVelez
- Last Updated: 2026-03-23
- Status: Draft
- Related Task Hub: `.devagent/workspace/tasks/active/2026-03-23_react-email-preview-server/`
- Stakeholders: PabloJVelez (Owner, Decision Maker)
- Notes: Plan derived from task research and sibling task `2026-02-15_react-email-preview-server` (sdoa). Implementation via `devagent implement-plan` or explicit execution against this document.

---

## PART 1: PRODUCT CONTEXT

### Summary

The Medusa app sends transactional emails through Resend using React Email templates in `apps/medusa/src/modules/resend/emails/`. Developers need a reliable way to preview layout and sample data locally. The React Email CLI (`email dev`) is already wired, but the preview sidebar only lists files that contain `export default`; today every template uses a named export for `service.ts`, so nothing appears in preview. This plan adds default exports and `PreviewProps` per template (keeping named exports unchanged), and aligns `apps/medusa` scripts with the proven sibling project: fixed preview port **3001** and optional **`dev:all`** running Medusa and the preview server together via **`concurrently`**.

### Context & Problem

- **Current state:** `dev:email` runs `email dev --dir ./src/modules/resend/emails` without a fixed port; five `.tsx` templates each export one named function only. `ResendNotificationProviderService` maps templates by those names (`orderPlacedEmail`, etc.).
- **Pain:** No local preview discoverability; sending real emails to validate markup is slow and noisy.
- **Trigger:** Parity with sibling codebase where the same pattern was implemented and verified.

**References:** `research/2026-03-23_react-email-preview-server-research.md`; [React Email CLI](https://react.email/docs/cli).

### Objectives & Success Metrics

- **Primary:** From `apps/medusa`, `yarn dev:email` starts the preview app on port **3001** and lists **all five** templates; each opens and renders using `PreviewProps` without runtime errors.
- **Constraint:** Resend continues to send using existing named imports in `apps/medusa/src/modules/resend/service.ts` (no import path or export name changes).
- **Secondary:** `yarn dev:all` runs `medusa develop` and `yarn dev:email` concurrently for one-command local DX.

### Users & Insights

- **Primary user:** Engineers editing email templates or notification payloads.
- **Insight:** Official CLI heuristics require `export default` on `.tsx` files; `Component.PreviewProps` is the documented way to supply preview data.

### Solution Principles

- Do not move or rename email files; keep a single flat directory under `resend/emails/`.
- Preserve named template exports used by the Resend provider.
- Prefer explicit types for props and preview mocks; avoid `any` for new preview-only shapes (see project TypeScript guidance).
- Dev-only behavior: no production runtime change beyond harmless extra exports in template modules.

### Scope Definition

- **In scope:** Updates to `apps/medusa/package.json` (`dev:email` port, `dev:all`, `concurrently` devDependency); per-file additions in the five email modules (`export type` where useful, `Component.PreviewProps`, `export default` component).
- **Out of scope:** New templates, receipt or other product features, changes to `service.ts`, Resend provider configuration, storefront.

### Functional Narrative

#### Flow: Preview emails locally

- **Trigger:** Developer runs `yarn dev:email` from `apps/medusa` (or `yarn dev:all` for backend + preview).
- **Experience:** Browser opens to the preview server on port 3001; sidebar shows five entries; selecting each renders the email with mock data.
- **Acceptance criteria:** All five render; named exports still resolve for sends.

#### Flow: Send email via Resend (regression)

- **Trigger:** Existing notification flow uses a template key from `Templates` enum.
- **Experience:** Same named function is invoked; HTML renders as before.
- **Acceptance criteria:** At least one real or staging send path still succeeds after changes.

### Technical Notes & Dependencies

- **CLI:** `email dev` supports `--dir` and `--port` (default 3000). This plan standardizes **3001** to reduce clashes with other local apps.
- **`concurrently`:** Add as `apps/medusa` devDependency (e.g. `^9.2.1`, matching sibling task; alternate: align with `apps/storefront` `^7.2.1` if lockfile consistency is preferred—choose one at implementation time).
- **`order-placed.tsx`:** Uses Medusa `OrderDTO` / `CustomerDTO` types; `PreviewProps` may use a **minimal mock** that satisfies fields read in JSX (no need for full DTO imports if types are satisfied via assertion or partial objects).

---

## PART 2: IMPLEMENTATION PLAN

### Scope & Assumptions

- **Scope focus:** `apps/medusa/package.json` and five files under `apps/medusa/src/modules/resend/emails/`.
- **Key assumptions:** Sibling behavior (port 3001 + `dev:all`) is the desired default for this repo; React Email `^4.2.4` remains the toolchain.
- **Out of scope:** Subscribers, workflows, admin UI, and documentation site changes unless discovered as blockers.

### Implementation Tasks

#### Task 1: Preview server scripts and `concurrently`

- **Objective:** Run the email preview on port 3001 and optionally run Medusa + preview together.
- **Impacted modules/files:** `apps/medusa/package.json`
- **References:** `research/2026-03-23_react-email-preview-server-research.md`; sibling plan `2026-02-15_react-email-preview-server-implementation-plan.md` (sdoa).
- **Dependencies:** None.
- **Acceptance criteria:**
  - `dev:email` is equivalent to `email dev --dir ./src/modules/resend/emails` with port **3001** (use CLI-supported flags, e.g. `--port 3001` or `-p 3001` per `email dev --help`).
  - `dev:all` runs both `medusa develop` and `yarn dev:email` via `concurrently` with distinct process names/colors (e.g. `concurrently -n medusa,email -c blue,green "medusa develop" "yarn dev:email"`).
  - `concurrently` added to `devDependencies`.
- **Testing criteria:** From `apps/medusa`, run `yarn dev:email` and confirm the process listens on 3001; run `yarn dev:all` and confirm both processes start (manual check).
- **Validation plan:** After Task 2, re-run preview and confirm all templates listed.

#### Task 2: Default export and `PreviewProps` on all five templates

- **Objective:** Make each file discoverable by the preview server and renderable with sample data without breaking Resend named imports.
- **Impacted modules/files:**
  - `apps/medusa/src/modules/resend/emails/chef-event-accepted.tsx`
  - `apps/medusa/src/modules/resend/emails/chef-event-rejected.tsx`
  - `apps/medusa/src/modules/resend/emails/chef-event-requested.tsx`
  - `apps/medusa/src/modules/resend/emails/event-details-resend.tsx`
  - `apps/medusa/src/modules/resend/emails/order-placed.tsx`
- **References:** [React Email CLI — PreviewProps](https://react.email/docs/cli); `apps/medusa/src/modules/resend/service.ts` (named imports to preserve).
- **Dependencies:** Can proceed in parallel with Task 1; full verification after both land.
- **Acceptance criteria:**
  - Each file **exports the props type** (e.g. `export type ChefEventAcceptedEmailProps` — promote existing `type` to exported if needed).
  - Each file sets **`ComponentName.PreviewProps`** with realistic mock data matching the props shape (use `as PropsType` if needed for TypeScript).
  - Each file ends with **`export default ComponentName`** (the same component the named wrapper renders).
  - Existing **named** export (`chefEventAcceptedEmail`, etc.) remains **unchanged** in name and call signature.
- **Testing criteria:** `yarn dev:email` → all five appear in sidebar → each renders. Run `yarn typecheck` from `apps/medusa` and ensure no new errors in modified email files. Trigger at least one notification flow that sends via Resend (staging or local) to confirm no regression.
- **Subtasks (props types already defined in-repo):**
  1. **chef-event-accepted** — `ChefEventAcceptedEmailProps`: mock `customer`, `booking`, `event`, `product`, `chef`, `requestReference`, `acceptanceDate`, `chefNotes`, `emailType: "customer_acceptance"`.
  2. **chef-event-rejected** — `ChefEventRejectedEmailProps`: align mocks with type fields (customer, booking, rejection, chef, requestReference, rejectionDate, emailType, etc.—verify against file).
  3. **chef-event-requested** — `ChefEventRequestedEmailProps`: customer, booking, event, requestReference, chefContact, emailType, etc.
  4. **event-details-resend** — `EventDetailsResendEmailProps`: customer, booking, event, product, chef, requestReference, emailType, etc.
  5. **order-placed** — `OrderPlacedEmailProps`: minimal `order` mock (e.g. `id`, `display_id`, `currency_code`, `customer`, `shipping_address`, line `items`, totals) plus optional `email_banner`; satisfy fields referenced in JSX.
- **Validation plan:** Manual preview pass + one send smoke test + TypeScript check on touched files.

### Implementation Guidance

- **From `.cursor/rules/typescript-patterns.mdc`:** Prefer explicit types over `any`; use exported types for props where it improves clarity; use type assertions sparingly for preview-only fixtures when full Medusa DTOs are impractical.
- **From React Email docs:** Default-exported component receives `PreviewProps` in the dev preview as if rendered `<Email {...Email.PreviewProps} />`.
- **From `apps/medusa/src/modules/resend/service.ts`:** Do not remove or rename `orderPlacedEmail`, `chefEventRequestedEmail`, `chefEventAcceptedEmail`, `chefEventRejectedEmail`, `eventDetailsResendEmail`.

### Release & Delivery Strategy

- Single change set; dev tooling and template modules only. No production deployment requirement beyond normal merge; preview is not run in production.

### Approval & Ops Readiness

- Owner sign-off sufficient; no ops or compliance gates.

---

## Risks & Open Questions

| Item | Type | Owner | Mitigation / Next Step | Due |
| --- | --- | --- | --- | --- |
| Port 3001 already in use | Risk | Implementer | Temporarily use another `--port` locally; optionally document in task log. | Implementation |
| Preview mock shape misses a new JSX field | Risk | Implementer | Fix mock or narrow component optional chaining; typecheck + preview click-through. | Task 2 |
| `concurrently` version choice vs storefront | Question | Implementer | Pick `^9.2.1` (sibling) or `^7.2.1` (storefront); either is acceptable. | Task 1 |

---

## Progress Tracking

Use `AGENTS.md` in this task hub for checklist and progress log during implementation.

---

## Appendices & References

- **Research:** `research/2026-03-23_react-email-preview-server-research.md`
- **Sibling (read-only):** `/Users/pablo/Personal/development/sdoa/sdoa/.devagent/workspace/tasks/completed/2026-02-15_react-email-preview-server/` (plan, clarification, research)
- **React Email CLI:** https://react.email/docs/cli
- **Resend provider:** `apps/medusa/src/modules/resend/service.ts`
