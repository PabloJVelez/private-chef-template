# Admin Google Calendar Integration Progress Tracker

- Owner: PabloJVelez
- Last Updated: 2026-04-25
- Status: Draft
- Task Hub: `.devagent/workspace/tasks/active/2026-04-23_admin-google-calendar-integration/`

## Summary
Implement a Google Calendar integration so app events are reflected in a connected Google account calendar, following the attached implementation research document as the primary reference. Scope for this task is explicitly single-chef/single-admin-account support only: the project currently supports one chef, so the integration should target that chef's Google account and does not need multi-admin or multi-chef connection logic at this stage.

## Agent Update Instructions
- Always update "Last Updated" to today's date (ISO: YYYY-MM-DD) when editing this file. Get the current date by explicitly running `date +%Y-%m-%d` first, then use the output for the "Last Updated" field.
- Progress Log: Append a new entry at the end in the form `- [YYYY-MM-DD] Event: concise update, links to files`. Do not rewrite or delete prior entries. Use the date retrieved from `date +%Y-%m-%d` for the date portion.
- Implementation Checklist: Mark items as `[x]` when complete, `[~]` for partial with a short note. Add new items if discovered; avoid removing items. Strike through only when obsolete.
- Key Decisions: Record important decisions as `- [YYYY-MM-DD] Decision: rationale, links`. Use the date retrieved from `date +%Y-%m-%d` for the date portion.
- References: Keep links current to latest spec, research, and tasks. Add additional references as they are created.
- Scope: Edits here should reflect coordination/progress only; do not include application code changes. Preserve history.

## Key Decisions
- [2026-04-23] Decision: Initial scope is single-chef/single-admin Google account integration only; multi-admin support is intentionally deferred.
- [2026-04-25] Decision: Google-originated changes are now policy-limited to date/time updates; Google cancellations/deletions are ignored and routed to an admin approval queue before any app cancellation is applied.
- [2026-04-25] Decision: Admin "Resync" now includes app-to-Google reconciliation after Google pull sync so missing linked events are restored in Google.
- [2026-04-25] Decision: Resync reconciliation scope is limited to events with `requestedDate` between sync trigger time and +60 days to avoid full historical scans.
- [2026-04-25] Decision: Push channel renewal is owned by a dedicated cron job (`renew-google-calendar-watch`, every 6h, renews when the watch expires within 24h) rather than the admin status route; the GET status endpoint stays read-only and idempotent.
- [2026-04-25] Decision: Webhook handler returns 202 immediately and dispatches the pull sync via `google-calendar.incremental-sync-requested` on the event bus; the subscriber holds a Redis-backed lock to coalesce overlapping pushes.
- [2026-04-25] Decision: Admin resync enqueues per-event `google-calendar.sync-requested` events for the 60-day window instead of running the upsert loop inline; the route returns 202 + `scheduled` count.
- [2026-04-25] Decision: Chef-event deletion explicitly cancels the linked Google event and purges sync map / pending incidents synchronously inside the workflow; FK ON DELETE was relaxed to `NO ACTION` to make the order of operations explicit.
- [2026-04-25] Decision: Channel token used to authenticate Google push notifications now reads from `GOOGLE_CALENDAR_CHANNEL_TOKEN` with a fallback to `GOOGLE_CALENDAR_SIGNING_SECRET` for backward compatibility.

## Progress Log
- [2026-04-23] Event: Task hub scaffolded via `new-task` workflow and initialized with summary/context.
- [2026-04-23] Event: Completed task-scoped research packet at `.devagent/workspace/tasks/active/2026-04-23_admin-google-calendar-integration/research/2026-04-23_google-calendar-integration-mvp.md`.
- [2026-04-23] Event: Completed clarification session and saved packet at `.devagent/workspace/tasks/active/2026-04-23_admin-google-calendar-integration/clarification/2026-04-23_initial-clarification.md`.
- [2026-04-23] Event: Created implementation plan at `.devagent/workspace/tasks/active/2026-04-23_admin-google-calendar-integration/plan/2026-04-23_google-calendar-integration-implementation-plan.md`.
- [2026-04-23] Event: Implemented Plan Task 1 foundation (Google calendar module, models, migration, config wiring, chef-event timezone) in `apps/medusa/src/modules/google-calendar-connection/**`, `apps/medusa/src/modules/chef-event/models/chef-event.ts`, and `apps/medusa/medusa-config.ts`.
- [2026-04-23] Event: Execution blocked after Task 1 by pre-existing workspace typecheck failures in `apps/storefront` during `yarn typecheck`; implement-plan paused per workflow.
- [2026-04-23] Event: Implemented most of Plan Task 2 API surface (admin Google Calendar status/connect/callback/resync routes and OAuth/token utility libs) in `apps/medusa/src/api/admin/google-calendar/**` and `apps/medusa/src/lib/google-calendar/**`.
- [2026-04-23] Event: Execution blocked again by pre-existing `apps/medusa` typecheck failures unrelated to this task (`src/admin/root.tsx` missing `@remix-run/react`, `EmailManagementSection.tsx` Badge `variant` prop error).
- [2026-04-23] Event: Implemented Plan Task 3 scaffolding (sync mapping helpers, sync subscriber, webhook route, sync event emission from create/update chef-event workflows) in `apps/medusa/src/lib/google-calendar/{mapping,events}.ts`, `apps/medusa/src/subscribers/google-calendar-sync-requested.ts`, `apps/medusa/src/api/webhooks/google-calendar/route.ts`, and workflow files.
- [2026-04-23] Event: Implemented most of Plan Task 4 admin surface (SDK resource, React Query hooks, admin widget integration wiring) in `apps/medusa/src/sdk/admin/admin-google-calendar.ts`, `apps/medusa/src/admin/hooks/google-calendar.ts`, `apps/medusa/src/admin/widgets/google-calendar-store-widget.tsx`, and `apps/medusa/src/sdk/index.ts`.
- [2026-04-23] Event: Re-ran `apps/medusa` typecheck; same pre-existing unrelated blockers remain (`src/admin/root.tsx`, `src/admin/routes/chef-events/components/EmailManagementSection.tsx`).
- [2026-04-23] Event: Extended Task 3 with incremental Google pull + `410` recovery and last-write-wins update application in `apps/medusa/src/lib/google-calendar/incremental-sync.ts` and webhook route integration.
- [2026-04-23] Event: Extended Task 4 with chef-event calendar sync visibility banner in `apps/medusa/src/admin/routes/chef-events/components/chef-event-calendar.tsx`.
- [2026-04-23] Event: Completed Task 5 manual QA/ops handoff by adding checklist artifact at `.devagent/workspace/tasks/active/2026-04-23_admin-google-calendar-integration/qa/2026-04-23_manual-qa-checklist.md`.
- [2026-04-23] Event: Completed missing app-to-Google write path by adding real Google Calendar `insert/update/cancel` API calls with sync-map ID/etag persistence in `apps/medusa/src/lib/google-calendar/events.ts` and sync-map lookup helper in `apps/medusa/src/modules/google-calendar-connection/service.ts`.
- [2026-04-25] Event: Implemented calendar UX follow-ups: moved resync action to chef-events page, removed last-synced from store settings widget, aligned calendar state persistence with URL query params, and removed local state/effects from `chef-event-calendar.tsx`.
- [2026-04-25] Event: Implemented guarded Google cancellation handling with admin review queue (incident model/service methods, webhook incremental-sync ignore-and-log behavior, approve/deny admin endpoints, SDK/hooks/widget actions) in `apps/medusa/src/modules/google-calendar-connection/**`, `apps/medusa/src/lib/google-calendar/{incremental-sync,events}.ts`, and `apps/medusa/src/{api,admin,sdk}/**`.
- [2026-04-25] Event: Extended admin resync route to run an app-to-Google reconciliation pass (upsert/cancel per chef-event status) after incremental pull sync so Google recovers missing linked events in `apps/medusa/src/api/admin/google-calendar/resync/route.ts`.
- [2026-04-25] Event: Scoped resync reconciliation window to `requestedDate` in `[sync_triggered_at, sync_triggered_at + 60 days]` and returned window metadata from `apps/medusa/src/api/admin/google-calendar/resync/route.ts`.
- [2026-04-25] Event: Applied review hardening pass: added `apps/medusa/src/jobs/renew-google-calendar-watch.ts` cron, refactored `apps/medusa/src/lib/google-calendar/ensure-watch.ts` to take a `MedusaContainer`, made `apps/medusa/src/api/webhooks/google-calendar/route.ts` async via `Modules.EVENT_BUS` + new `apps/medusa/src/subscribers/google-calendar-incremental-sync.ts` (with cache-backed lock), refactored admin resync to enqueue per-event sync events, taught `apps/medusa/src/workflows/delete-chef-event.ts` to cancel on Google + purge artifacts, removed FK cascade via new `Migration20260425130000.ts`, hardened `apps/medusa/src/api/admin/google-calendar/incidents/[id]/{approve,deny}/route.ts` with `MedusaError` + Zod, dropped `any` and added rationale comments in `apps/medusa/src/lib/google-calendar/incremental-sync.ts`, added retry/jitter to `apps/medusa/src/lib/google-calendar/tokens.ts`, and split the channel token to its own env var (`GOOGLE_CALENDAR_CHANNEL_TOKEN`).

## Implementation Checklist
- [ ] Define exact feature scope and acceptance criteria from the attached integration report.
- [x] Run `devagent research` to validate architecture decisions in this codebase.
- [x] Run `devagent clarify-task` to lock requirements and decisions.
- [x] Run `devagent create-plan` to produce an implementation plan for phased delivery.
- [x] Task 1: Data model and module foundation.
- [x] Task 2: Admin API and OAuth lifecycle endpoints.
- [x] Task 3: Sync pipeline, webhook handling, and conflict behavior.
- [x] Task 4: Admin SDK/hooks/widget and event UI integration.
- [x] Task 5: Verification checklist, observability, and implementation handoff.
- [x] Post-MVP policy update: Google delete/cancel events require explicit admin approve/deny decisions before app lifecycle changes.
- [x] Post-MVP review hardening: cron-based watch renewal, async webhook + dedup lock, per-event resync enqueue, delete-chef-event Google cancel, FK cascade removal, MedusaError+Zod in admin routes, refresh-token retry, dedicated channel-token env var.

## Open Questions
- Drawer transparency on the chef-events review panel is parked; revisit once `@medusajs/ui` ships a stable Drawer or replace with a custom side panel.
- Add automated tests for crypto, token refresh, mapping, color helpers, and the conflict / incident policy (deferred from review hardening pass).

## References
- Attached implementation report: `/Users/pablo/Downloads/deep-research-report (1).md` (freshness: 2026-04-23)
- Internal context search result: No direct matches found in `.devagent/workspace/product/**` for `google|calendar|chef events|scheduling` as of 2026-04-23.
- Internal context search result: No direct matches found in `.devagent/workspace/memory/**` for `google|calendar|chef events|scheduling` as of 2026-04-23.
- Research packet: `.devagent/workspace/tasks/active/2026-04-23_admin-google-calendar-integration/research/2026-04-23_google-calendar-integration-mvp.md` (freshness: 2026-04-23)
- Clarification packet: `.devagent/workspace/tasks/active/2026-04-23_admin-google-calendar-integration/clarification/2026-04-23_initial-clarification.md` (freshness: 2026-04-23)
- Plan: `.devagent/workspace/tasks/active/2026-04-23_admin-google-calendar-integration/plan/2026-04-23_google-calendar-integration-implementation-plan.md` (freshness: 2026-04-23)
- QA checklist: `.devagent/workspace/tasks/active/2026-04-23_admin-google-calendar-integration/qa/2026-04-23_manual-qa-checklist.md` (freshness: 2026-04-23)

## Next Steps
- Run manual QA checklist and validate OAuth/webhook environment configuration.
