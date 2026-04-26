# Admin Google Calendar Integration Plan

- Owner: PabloJVelez
- Last Updated: 2026-04-25
- Status: Draft
- Related Task Hub: `.devagent/workspace/tasks/completed/2026-04-23_admin-google-calendar-integration/`
- Stakeholders: PabloJVelez (Requestor, Decision Maker)
- Notes: Clarification decisions are authoritative; research packet is supporting context where it does not conflict.

---

## PART 1: PRODUCT CONTEXT

### Summary
Implement a single-chef/single-admin Google Calendar integration for `chef_event` records in Medusa Admin, with linked-event bidirectional sync and silent updates. The feature adds admin OAuth connection flows, timezone-aware event mapping, asynchronous sync orchestration, and Google webhook incremental sync handling. This improves operator scheduling reliability while preserving template reusability for future chef client setups.

### Context & Problem
The current system has strong Chef Event CRUD and calendar display capability but no Google account integration. Existing patterns for third-party account connection and admin UX already exist via Stripe Connect and should be reused. Current Chef Event scheduling data lacks explicit timezone semantics for robust Google datetime interoperability.

Primary source artifacts:
- `.devagent/workspace/tasks/completed/2026-04-23_admin-google-calendar-integration/research/2026-04-23_google-calendar-integration-mvp.md`
- `.devagent/workspace/tasks/completed/2026-04-23_admin-google-calendar-integration/clarification/2026-04-23_initial-clarification.md`
- `/Users/pablo/Downloads/deep-research-report (1).md`

### Objectives & Success Metrics
- Deliver Google Calendar connection and sync support for one chef/admin account.
- Ensure linked-event bidirectional synchronization with conflict policy `last-write-wins`.
- Ensure cancellation in app maps to Google `status=cancelled`.
- Ensure Google-originated cancellation/deletion events are ignored by default and routed to an explicit admin approve/deny decision flow.
- Ensure timezone is explicit and used in sync mapping.
- Preserve existing behavior when Google is not connected.
- MVP acceptance is completion of manual QA checklist defined in this plan.

### Users & Insights
- Primary user: operator/admin managing private-chef events in Medusa Admin.
- Secondary user: chef whose personal Google Calendar reflects event schedule.
- Insight: Existing Stripe Connect pattern in repo is the fastest path to predictable admin UX and maintainable integration shape.

### Solution Principles
- Reuse established Medusa module + admin API + SDK + hooks + widget patterns.
- Keep sync logic server-side and asynchronous; do not push Google writes from browser UI.
- Treat app and Google synchronization as linked-event only; ignore unrelated Google-native events.
- Keep integration additive and optional so disconnected state is safe by default.
- Enforce silent sync (`sendUpdates=none`) for MVP.

### Scope Definition
- **In Scope:** single-account connection, OAuth connect/callback/disconnect/status/resync, timezone field support, linked-event bidirectional sync, webhook incremental sync, cancellation mapping, manual QA checklist.
- **Out of Scope / Future:** multi-admin/multi-chef connection routing, Google-native event import to app records, attendee invitation workflows, automated performance/non-functional SLA gates.

### Functional Narrative

#### Flow 1: Admin connects Google account
- Trigger: Admin clicks Connect in new Google Calendar widget.
- Experience narrative: Admin is redirected through OAuth flow and returns with active connection state.
- Acceptance criteria: status endpoint returns connected state and metadata; reconnect/disconnect actions are available.

#### Flow 2: App event changes sync to Google
- Trigger: create/update/cancel/complete of `chef_event`.
- Experience narrative: async sync worker upserts/cancels linked Google event and persists sync metadata.
- Acceptance criteria: linked Google events mirror app changes; cancellation maps to `status=cancelled`; no attendee notifications sent.

#### Flow 3: Google linked-event changes sync back to app
- Trigger: Google push notification on watched resource.
- Experience narrative: webhook enqueues incremental sync and applies only date/time field updates into app using last-write-wins policy; Google cancellations/deletions create a pending admin review item instead of auto-cancelling app records.
- Acceptance criteria: date/time edits from Google update linked app events, while Google cancellation/deletion remains blocked until admin approves or denies via review UI.

### Technical Notes & Dependencies
- Requires Google Cloud OAuth app configuration and approved redirect/webhook URLs.
- Requires encrypted token-at-rest strategy in connection storage.
- Requires schema changes for timezone support and sync tracking records.
- Requires asynchronous processing and resilient retry/error handling for webhook/sync jobs.

---

## PART 2: IMPLEMENTATION PLAN

### Scope & Assumptions
- Scope focus: backend Medusa module/API/sync orchestration plus admin integration surfaces.
- Key assumptions:
  - One active Google account connection is sufficient for MVP.
  - `calendar.events` scope is approved for MVP.
  - Manual QA checklist is acceptable release gate for this phase.
- Out of scope: production launch process tasks and post-launch support operations.

### Implementation Tasks

#### Task 1: Data model and module foundation
- **Objective:** Add core persistence and service layer for Google connection and sync state, including timezone support.
- **Impacted Modules/Files:**
  - `apps/medusa/src/modules/chef-event/models/chef-event.ts` (timezone field support)
  - `apps/medusa/src/modules/google-calendar-connection/index.ts` (new)
  - `apps/medusa/src/modules/google-calendar-connection/service.ts` (new)
  - `apps/medusa/src/modules/google-calendar-connection/models/google-calendar-connection.ts` (new)
  - `apps/medusa/src/modules/google-calendar-connection/models/google-calendar-sync-map.ts` (new)
  - `apps/medusa/medusa-config.ts` (module registration + env wiring)
  - `apps/medusa/src/modules/**/migrations/*` (new migration(s))
- **References:**
  - `.devagent/workspace/tasks/completed/2026-04-23_admin-google-calendar-integration/clarification/2026-04-23_initial-clarification.md`
  - `.cursor/rules/medusa-development.mdc`
- **Dependencies:** None.
- **Acceptance Criteria:**
  - Schema supports explicit timezone for synced events.
  - Connection and sync map entities persist required identifiers/tokens/metadata.
  - Module is registered and resolvable from request scope.
- **Testing Criteria:**
  - Unit tests for service methods and validation branches.
  - Migration applies and rolls back successfully in local environment.
- **Validation Plan:** run module/service tests and migration command checks.

#### Task 2: Admin API and OAuth lifecycle endpoints
- **Objective:** Implement Google connect/status/callback/disconnect/resync endpoints and token lifecycle management.
- **Impacted Modules/Files:**
  - `apps/medusa/src/api/admin/google-calendar/route.ts` (new)
  - `apps/medusa/src/api/admin/google-calendar/connect/route.ts` (new)
  - `apps/medusa/src/api/admin/google-calendar/callback/route.ts` (new)
  - `apps/medusa/src/api/admin/google-calendar/resync/route.ts` (new)
  - `apps/medusa/src/lib/google-calendar/crypto.ts` (new)
  - `apps/medusa/src/lib/google-calendar/tokens.ts` (new)
  - `apps/medusa/src/lib/google-calendar/client.ts` (new helper(s))
- **References:**
  - `apps/medusa/src/api/admin/stripe-connect/route.ts`
  - `.devagent/workspace/tasks/completed/2026-04-23_admin-google-calendar-integration/research/2026-04-23_google-calendar-integration-mvp.md`
- **Dependencies:** Task 1.
- **Acceptance Criteria:**
  - Admin can initiate OAuth and complete callback successfully.
  - Status endpoint reflects connected/not-connected and error states.
  - Disconnect removes/deactivates connection state safely.
  - Resync endpoint schedules sync execution.
- **Testing Criteria:**
  - Integration tests for endpoint contracts and error handling.
  - Unit tests for token encryption/decryption and refresh behavior.
- **Validation Plan:** execute API integration tests and verify JSON response contracts.

#### Task 3: Sync pipeline, webhook handling, and conflict behavior
- **Objective:** Implement linked-event bidirectional sync orchestration, incremental sync, last-write-wins conflict policy, and guarded handling for Google cancellations/deletions.
- **Impacted Modules/Files:**
  - `apps/medusa/src/lib/google-calendar/mapping.ts` (new)
  - `apps/medusa/src/lib/google-calendar/events.ts` (new)
  - `apps/medusa/src/api/webhooks/google-calendar/route.ts` (new)
  - `apps/medusa/src/subscribers/google-calendar-sync-requested.ts` (new)
  - `apps/medusa/src/workflows/create-chef-event.ts` (trigger sync enqueue)
  - `apps/medusa/src/workflows/update-chef-event.ts` (trigger sync enqueue)
  - `apps/medusa/src/workflows/accept-chef-event.ts` or relevant status workflows (completion/cancel triggers)
- **References:**
  - `apps/medusa/src/subscribers/chef-event-requested.ts`
  - `.devagent/workspace/tasks/completed/2026-04-23_admin-google-calendar-integration/clarification/2026-04-23_initial-clarification.md`
- **Dependencies:** Tasks 1-2.
- **Acceptance Criteria:**
  - App lifecycle triggers (create/update/cancel/complete/delete) enqueue sync operations; delete also synchronously cancels the Google event and purges the sync map / incidents.
  - Cancellation maps to Google event `status=cancelled`.
  - Webhook returns 202 immediately and dispatches `google-calendar.incremental-sync-requested` on the event bus; the dedicated subscriber holds a cache-backed lock and processes incremental updates, handling `410` by full resync.
  - Push channel renewal is owned by the `renew-google-calendar-watch` cron (every 6h, renews when the watch expires within 24h); the admin status route stays read-only.
  - Conflict strategy follows last-write-wins for mapped date/time fields; the lib comment explains why we bypass the update workflow when applying Google-originated changes.
  - Google-side cancellation/deletion is ignored and recorded as a pending admin incident.
  - Admin resync enqueues per-event `google-calendar.sync-requested` events for events with `requestedDate` in `[trigger, trigger+60d]` so app changes propagate to Google asynchronously; the route returns 202 with the count of scheduled jobs.
- **Testing Criteria:**
  - Integration tests for webhook and incremental sync branches.
  - Unit tests for mapping and conflict-resolution helpers.
- **Validation Plan:** run sync-related unit/integration test suite and verify replay/idempotency behavior.

#### Task 4: Admin SDK/hooks/widget and event UI integration
- **Objective:** Expose integration controls in admin and align operator workflow with existing Stripe widget conventions.
- **Impacted Modules/Files:**
  - `apps/medusa/src/sdk/admin/admin-google-calendar.ts` (new)
  - `apps/medusa/src/sdk/index.ts` (register resource)
  - `apps/medusa/src/admin/hooks/google-calendar.ts` (new)
  - `apps/medusa/src/admin/widgets/google-calendar-store-widget.tsx` (new)
  - `apps/medusa/src/admin/routes/chef-events/components/chef-event-calendar.tsx` (status indicators, optional links)
  - `apps/medusa/src/admin/routes/chef-events/components/event-adapter.ts` (timezone-aware handling alignment)
- **References:**
  - `apps/medusa/src/admin/widgets/stripe-connect-store-widget.tsx`
  - `.cursor/rules/typescript-patterns.mdc`
- **Dependencies:** Task 2.
- **Acceptance Criteria:**
  - Widget supports connect, status visibility, resync, and disconnect actions.
  - Widget surfaces ignored Google cancellation/deletion incidents and provides approve/deny controls.
  - Chef event calendar UI remains functional and can surface sync state safely.
  - No behavior regression for stores without Google connection.
- **Testing Criteria:**
  - Unit tests for hooks/resource methods and error states.
  - Manual QA checklist coverage for admin interaction flows.
- **Validation Plan:** execute component/hook tests and perform manual admin smoke checks.

#### Task 5: Verification checklist, observability, and implementation handoff
- **Objective:** Finalize MVP verification protocol and ensure operational signals are visible for sync errors.
- **Impacted Modules/Files:**
  - `.devagent/workspace/tasks/completed/2026-04-23_admin-google-calendar-integration/AGENTS.md` (implementation checklist updates during execution)
  - `.devagent/workspace/tasks/completed/2026-04-23_admin-google-calendar-integration/plan/2026-04-23_google-calendar-integration-implementation-plan.md` (manual QA checklist maintenance)
  - `apps/medusa/src/api/middlewares.ts` (if needed for error capture consistency)
  - `apps/medusa/instrumentation.ts` (if needed for structured telemetry tags)
- **References:**
  - `.cursor/rules/testing-patterns-unit.mdc`
  - `.cursor/rules/testing-patterns-integration.mdc`
  - `.cursor/rules/testing-patterns-e2e.mdc`
- **Dependencies:** Tasks 1-4.
- **Acceptance Criteria:**
  - Manual QA checklist is explicit and executable by operator.
  - Critical sync failures are captured with actionable context in logs/telemetry.
  - Plan is ready to execute via `devagent implement-plan`.
- **Testing Criteria:**
  - Manual checklist includes connect, create/update/cancel/complete, webhook-driven pullback, disconnect, and reconnect scenarios.
  - Validate observability events for sync success/failure paths.
- **Validation Plan:** perform checklist walkthrough in staging/local test environment.

### Implementation Guidance
- **From `.devagent/workspace/memory/constitution.md` (C1 Mission-first delivery):**
  - Plans and implementation tasks must clearly trace to mission outcomes and template leverage.
- **From `.devagent/workspace/memory/constitution.md` (C2 Quality and maintainability):**
  - Follow project standards and keep this workflow documentation-only; code changes happen only in implementation phase.
- **From `.cursor/rules/medusa-development.mdc`:**
  - Use Medusa module + service + admin/store API route patterns, validate boundaries with Zod, and apply DI/service-factory conventions.
- **From `.cursor/rules/typescript-patterns.mdc`:**
  - Keep strong typings across DTOs/hooks/services and avoid `any` in new integration surfaces.
- **From `.cursor/rules/testing-patterns-unit.mdc` and `.cursor/rules/testing-patterns-integration.mdc`:**
  - Use behavior-focused AAA test design and verify API/service integration paths.

---

## Risks & Open Questions

| Item | Type (Risk / Question) | Owner | Mitigation / Next Step | Due |
| --- | --- | --- | --- | --- |
| Google OAuth consent/app configuration delays | Risk | PabloJVelez | Configure and validate OAuth app/redirects before implementation starts | Before Task 2 |
| Clarification defers strict precedence of research vs clarification in edge cases | Question | PabloJVelez | In implementation, treat clarification as source-of-truth and log any contradictions found | During Task 1 |
| Last-write-wins may overwrite desirable edits in race conditions | Risk | Implementer | Log conflict metadata for traceability; document behavior in admin-facing notes | During Task 3 |
| Manual QA-only done bar may miss regressions without automated coverage | Risk | PabloJVelez | Add targeted unit/integration tests for highest-risk sync paths despite manual gate | During Tasks 2-4 |

---

## Progress Tracking
Refer to `.devagent/workspace/tasks/completed/2026-04-23_admin-google-calendar-integration/AGENTS.md` for implementation tracking updates.

---

## Appendices & References
- Task hub: `.devagent/workspace/tasks/completed/2026-04-23_admin-google-calendar-integration/AGENTS.md`
- Clarification packet: `.devagent/workspace/tasks/completed/2026-04-23_admin-google-calendar-integration/clarification/2026-04-23_initial-clarification.md`
- Research packet: `.devagent/workspace/tasks/completed/2026-04-23_admin-google-calendar-integration/research/2026-04-23_google-calendar-integration-mvp.md`
- Product mission: `.devagent/workspace/product/mission.md`
- Constitution: `.devagent/workspace/memory/constitution.md`
- Implementation standards: `.cursor/rules/medusa-development.mdc`, `.cursor/rules/typescript-patterns.mdc`, `.cursor/rules/testing-patterns-unit.mdc`, `.cursor/rules/testing-patterns-integration.mdc`, `.cursor/rules/testing-patterns-e2e.mdc`
