# Research: Admin Google Calendar Integration MVP

## Classification & Assumptions
- Classification: Implementation design research (task-scoped).
- Inferred Problem Statement: Define an MVP integration for syncing app `chef_event` records to Google Calendar for the single supported chef/admin account, aligned to current Medusa admin patterns and Google API best practices.
- Assumptions:
  - [INFERRED] The active task is `.devagent/workspace/tasks/active/2026-04-23_admin-google-calendar-integration/`.
  - [INFERRED] MVP must support one connected Google account only (no multi-admin connection logic yet).
  - [INFERRED] The attached report at `/Users/pablo/Downloads/deep-research-report (1).md` is the primary product/technical intent source.

## Research Plan (What Was Validated)
1. Verify repo architecture and extension points for third-party account connection UX and admin API patterns.
2. Verify current Chef Event data model constraints that impact calendar sync correctness.
3. Validate Google-recommended OAuth/server flow and token handling expectations for backend integrations.
4. Validate Google push + incremental sync requirements, including invalid sync token recovery.
5. Confirm least-privilege Calendar scope options for this MVP.

## Sources (With Links and Versions)
### Internal
- Task context: `.devagent/workspace/tasks/active/2026-04-23_admin-google-calendar-integration/AGENTS.md` (accessed 2026-04-23).
- Product mission: `.devagent/workspace/product/mission.md` (accessed 2026-04-23).
- Constitution: `.devagent/workspace/memory/constitution.md` (accessed 2026-04-23).
- Existing connection widget pattern: `apps/medusa/src/admin/widgets/stripe-connect-store-widget.tsx` (accessed 2026-04-23).
- Existing status route pattern: `apps/medusa/src/api/admin/stripe-connect/route.ts` (accessed 2026-04-23).
- Chef event model constraints: `apps/medusa/src/modules/chef-event/models/chef-event.ts` (accessed 2026-04-23).
- Calendar adapter behavior: `apps/medusa/src/admin/routes/chef-events/components/event-adapter.ts` (accessed 2026-04-23).
- Coding standards: `.cursor/rules/typescript-patterns.mdc`, `.cursor/rules/medusa-development.mdc` (accessed 2026-04-23).
- Prior deep dive: `/Users/pablo/Downloads/deep-research-report (1).md` (accessed 2026-04-23).

### External (Authoritative)
- Google OAuth web-server flow: [Using OAuth 2.0 for Web Server Applications](https://developers.google.com/identity/protocols/oauth2/web-server) (fetched 2026-04-23).
- Google Calendar scopes: [Choose Google Calendar API scopes](https://developers.google.com/workspace/calendar/api/auth) (fetched 2026-04-23).
- Google Calendar push notifications: [Push notifications](https://developers.google.com/workspace/calendar/api/guides/push) (fetched 2026-04-23).
- Google Calendar incremental sync: [Synchronize resources efficiently](https://developers.google.com/workspace/calendar/api/guides/sync) (fetched 2026-04-23).

## Findings & Tradeoffs
1. Existing Stripe Connect implementation is the strongest local blueprint.
   - Evidence: widget interaction model and `/admin/...` route shape already exist and are production-used.
   - Impact: build a parallel Google Calendar connection surface (`status/connect/callback/disconnect/resync`) instead of inventing new UX/API conventions.

2. Current `chef_event` model lacks timezone and Google linkage fields.
   - Evidence: model includes `requestedDate` + `requestedTime` but no explicit IANA timezone field; adapter currently reconstructs event times with fallbacks.
   - Impact: MVP should add explicit timezone handling (recommended new field) to avoid ambiguous Google `dateTime` writes and DST issues.

3. Single-account MVP allows simplified connection schema now, but should avoid dead-end design.
   - Tradeoff:
     - Simplest now: one connection record (or singleton config) and one map per chef event.
     - Future-ready with minimal overhead: keep a `connectionId` in sync mappings even if only one connection is used.
   - Recommendation: implement schema in a way that can expand to multi-admin later without data migration churn.

4. Push + incremental sync is the robust Google-to-app mechanism; webhook payloads are header-only.
   - Evidence: Google push docs state change notifications do not include full changed resource body.
   - Impact: webhook endpoint should enqueue background sync using stored sync token, then call `events.list` incrementally.

5. `syncToken` invalidation (`410`) must trigger full resync logic.
   - Evidence: Google incremental sync guide explicitly requires client store reset/full sync on `410`.
   - Impact: MVP implementation must include deterministic recovery path, not just logging.

6. Least-privilege scope for this task is likely `calendar.events.owned`.
   - Evidence: scope table distinguishes owned calendars from all calendars; docs recommend narrowest scope possible.
   - Tradeoff: if tests show limitations, fallback to `calendar.events`.

## Recommendation
Implement MVP as **app-to-Google primary path plus safe Google-to-app updates for linked events only**, with **single-account configuration**:

- Use a Google connection module and admin routes patterned after Stripe Connect.
- Persist one active Google connection for now (single chef), but keep sync map schema with `connectionId` for forward compatibility.
- Add timezone support for `chef_event` scheduling data before enabling bidirectional time updates.
- Use OAuth authorization code flow on backend with offline access and encrypted token storage.
- Register watch channels and process notifications through async workers that perform incremental sync and `410` recovery.
- Restrict OAuth scope to `calendar.events.owned` initially.

## Repo Next Steps (Checklist)
- [ ] Confirm MVP direction in task tracker: linked-event bidirectional vs app-to-Google-only first release.
- [ ] Define data model changes (timezone + connection + sync map) in a plan artifact.
- [ ] Define route/API contracts mirroring Stripe patterns for Google connect lifecycle.
- [ ] Define background sync jobs/subscribers and retry/error policy.
- [ ] Define acceptance tests for OAuth callback, push webhook, incremental sync, and `410` recovery.
- [ ] Run `devagent create-plan` to convert research into implementable phased tasks.

## Risks & Open Questions
- [NEEDS CLARIFICATION] Product expectation for edits made directly in Google: fully supported in MVP or deferred?
- If timezone is not added, datetime conversion may be wrong around DST and cross-zone usage.
- Google channel expiration renewal must be operationalized (scheduled renewal and disconnect stop flow).
- Scope approval/security review needed for OAuth consent and production publishing.
