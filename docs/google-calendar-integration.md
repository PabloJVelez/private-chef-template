# Google Calendar Integration

This document is a **deep implementation guide** for the Google Calendar integration in this repository, intended to be reused by sibling projects.

It explains:

- architecture and design decisions
- data model and sync state machine
- route/subscriber/job responsibilities
- cancellation incident workflow
- operational runbook and failure recovery
- a practical porting checklist for sibling projects

---

## 1) Goal and Scope

### Business goal

Keep `chef_event` records and Google Calendar events aligned for a single admin/single chef setup, while preventing destructive Google-side cancellations from auto-canceling app events.

### Scope implemented

- OAuth connect/callback/disconnect/status
- encrypted token storage + refresh flow
- app -> Google sync on create/update/accept/reject/delete
- Google -> app incremental sync through push notifications + `syncToken`
- guardrail policy: Google cancellation/deletion creates a review **incident**
- admin incident approval/denial actions
- manual resync endpoint with bounded app->Google reconciliation window
- watch renewal cron to prevent silent webhook expiry

### Explicit non-goals (for now)

- multi-admin/multi-chef tenancy
- importing unrelated Google-native events into app
- attendee invitation workflows
- full automated test suite for all sync branches (deferred follow-up)

---

## 2) High-Level Architecture

### Core components

- **Google connection module**: `apps/medusa/src/modules/google-calendar-connection/*`
  - stores OAuth connection, event link map, incidents
- **Google sync libs**: `apps/medusa/src/lib/google-calendar/*`
  - mapping, token refresh, watch management, incremental sync, event upsert/cancel
- **Event bus subscribers**: `apps/medusa/src/subscribers/google-calendar-*.ts`
  - async execution for app->Google and Google->app sync
- **Admin API routes**: `apps/medusa/src/api/admin/google-calendar/**`
  - connection lifecycle, resync, incident approve/deny
- **Webhook route**: `apps/medusa/src/api/webhooks/google-calendar/route.ts`
  - receives Google push and enqueues pull sync
- **Watch renewal job**: `apps/medusa/src/jobs/renew-google-calendar-watch.ts`
  - keeps watch channel from expiring

### Sync model

- **Pull side (Google -> app)**:
  1. Google calls webhook
  2. webhook emits `google-calendar.incremental-sync-requested`
  3. subscriber runs `runIncrementalSync`
  4. `syncToken` incremental events are applied to linked `chef_event` records

- **Push side (app -> Google)**:
  1. workflows emit `google-calendar.sync-requested` on app event changes
  2. subscriber runs `syncChefEventRecord`
  3. creates/patches/cancels Google event and updates sync map metadata

---

## 3) Data Model

## `google_calendar_connection`

Model: `apps/medusa/src/modules/google-calendar-connection/models/google-calendar-connection.ts`

Primary responsibilities:

- stores OAuth token material (encrypted)
- stores watch channel metadata
- stores incremental sync cursor (`nextSyncToken`)
- stores health (`status`, `lastSyncError`)

Important fields:

- `accessTokenEnc`, `refreshTokenEnc`, `accessTokenExpiresAt`
- `watchChannelId`, `watchResourceId`, `watchExpiresAt`
- `nextSyncToken`
- `status`: `not_connected | active | reauthorization_required | sync_error`
- `lastSyncedAt`, `lastSyncError`

## `google_calendar_sync_map`

Model: `apps/medusa/src/modules/google-calendar-connection/models/google-calendar-sync-map.ts`

Primary responsibilities:

- links one `chef_event` to one Google event
- stores version/timestamp metadata to drive conflict handling

Important fields:

- `chefEventId`, `googleEventId`
- `googleEtag`, `googleUpdatedAt`
- `lastPushedAt` (app -> Google timestamp)
- `lastPulledAt` (Google -> app timestamp)
- `lastAppHash`
- `syncState`: `linked | cancelled_in_app | cancelled_in_google | sync_error`

## `google_calendar_sync_incident`

Model: `apps/medusa/src/modules/google-calendar-connection/models/google-calendar-sync-incident.ts`

Primary responsibilities:

- queue admin decisions when Google sends cancellation/deletion
- preserve auditability of conflict events

Important fields:

- `chefEventId`, `googleEventId`
- `incidentType`: currently `google_cancelled_ignored`
- `status`: `pending | approved | denied`
- `payload`, `googleUpdatedAt`, `resolvedAt`, `resolvedBy`

---

## 4) Migrations and FK Strategy

Migration files:

- `Migration20260423090000.ts`
- `Migration20260425120000.ts` (incident table for already-migrated DBs)
- `Migration20260425130000.ts` (removes ON DELETE CASCADE on chef_event FKs)

### Why FK cascade was removed

`sync_map`/`incident` FKs to `chef_event` are now `ON DELETE NO ACTION`.

Reason:

- deletion flow now explicitly:
  1. cancels Google event (best effort)
  2. purges map/incidents
  3. deletes `chef_event`

This avoids cascade racing ahead of explicit integration cleanup.

---

## 5) Configuration and Environment Variables

Configured through `apps/medusa/medusa-config.ts` and module options in `apps/medusa/src/modules/google-calendar-connection/index.ts`.

Required/important env vars:

- `GOOGLE_CALENDAR_CLIENT_ID`
- `GOOGLE_CALENDAR_CLIENT_SECRET`
- `GOOGLE_CALENDAR_REDIRECT_URI`
- `GOOGLE_CALENDAR_WEBHOOK_URL`
- `GOOGLE_CALENDAR_SCOPE` (defaults to Calendar Events scope)
- `GOOGLE_CALENDAR_SIGNING_SECRET` (OAuth state signing)
- `GOOGLE_CALENDAR_TOKEN_ENCRYPTION_KEY` (32-byte base64 key)

Recommended hardening:

- `GOOGLE_CALENDAR_CHANNEL_TOKEN` (dedicated webhook channel token)
  - if omitted, fallback path uses signing secret for backward compatibility

Optional:

- `GOOGLE_CALENDAR_DEFAULT_TIMEZONE` (fallback zone, default `America/Chicago`)

---

## 6) OAuth and Token Lifecycle

### Connect flow

1. Admin triggers `POST /admin/google-calendar/connect`
2. backend builds signed OAuth `state`
3. user completes Google consent
4. callback route exchanges code for tokens:
   - `GET /admin/google-calendar/callback`
5. token values are encrypted and persisted
6. watch registration is triggered via `ensureGoogleCalendarWatchAndBootstrapSync`

Files:

- `apps/medusa/src/api/admin/google-calendar/connect/route.ts`
- `apps/medusa/src/api/admin/google-calendar/callback/route.ts`
- `apps/medusa/src/lib/google-calendar/oauth-state.ts`
- `apps/medusa/src/lib/google-calendar/crypto.ts`

### Access token refresh

`ensureValidAccessToken`:

- uses existing access token if not close to expiry
- otherwise refreshes via `refresh_token`
- persists new access token + expiry
- retries transient refresh failures with exponential backoff + jitter
- sets connection `status=reauthorization_required` on permanent failure

File:

- `apps/medusa/src/lib/google-calendar/tokens.ts`

---

## 7) Watch Channels, Webhooks, and Incremental Pull Sync

## What a watch does

A Google watch is a push subscription. It does **not** include changed event payloads; it only notifies that something changed. Actual changes are fetched through incremental list with `syncToken`.

## Watch registration

`ensureGoogleCalendarWatchAndBootstrapSync`:

- resolves logger and services from Medusa container
- validates webhook URL
- ensures valid access token
- stops old channel if present (`channels.stop`)
- creates new channel (`events.watch`)
- stores new channel IDs and expiry metadata
- optionally runs incremental sync bootstrap

File:

- `apps/medusa/src/lib/google-calendar/ensure-watch.ts`

Helper API calls:

- `apps/medusa/src/lib/google-calendar/watch.ts`

## Watch renewal

`renew-google-calendar-watch` job (cron `0 */6 * * *`) renews watch when:

- no active channel exists, or
- current channel expires in < 24 hours

File:

- `apps/medusa/src/jobs/renew-google-calendar-watch.ts`

## Webhook handling

Route: `POST /webhooks/google-calendar`

Current behavior:

- validates channel token
- updates channel metadata if needed
- immediately returns `202` after enqueue
- emits `google-calendar.incremental-sync-requested` on event bus
- does not run long sync work inline in request thread

File:

- `apps/medusa/src/api/webhooks/google-calendar/route.ts`

## Incremental sync subscriber and dedup

Subscriber:

- `apps/medusa/src/subscribers/google-calendar-incremental-sync.ts`

Responsibilities:

- acquires cache lock (`google-calendar:incremental-sync:lock`)
- skips overlapping runs
- runs `runIncrementalSync`
- releases lock in `finally`

## Incremental sync mechanics

`runIncrementalSync`:

- calls Google `events.list` with `syncToken`
- handles pagination
- handles `410 Gone` by clearing token and retrying once
- updates connection `nextSyncToken` when complete

`applyGoogleEventToChefEvent`:

- resolves linked `chefEventId` from extended props or sync map lookup
- computes timestamp comparisons (`googleUpdatedAt`, `lastPushedAt`, app `updated_at`)
- applies last-write-wins to mapped fields
- updates sync map pull metadata
- on Google `cancelled`: creates/updates pending incident and exits

File:

- `apps/medusa/src/lib/google-calendar/incremental-sync.ts`

---

## 8) App -> Google Sync Pipeline

## Triggering events from workflows

Workflows emit `google-calendar.sync-requested` after app lifecycle changes.

Key files:

- `apps/medusa/src/workflows/create-chef-event.ts`
- `apps/medusa/src/workflows/update-chef-event.ts`
- `apps/medusa/src/workflows/accept-chef-event.ts`
- `apps/medusa/src/workflows/reject-chef-event.ts`
- `apps/medusa/src/workflows/delete-chef-event.ts` (special handling below)

## Subscriber execution

Subscriber:

- `apps/medusa/src/subscribers/google-calendar-sync-requested.ts`

Behavior:

- retrieves target `chef_event`
- determines operation (`upsert` vs `cancel`)
- calls `syncChefEventRecord`
- persists connection error status on failure

## Event write mechanics

`syncChefEventRecord` in `apps/medusa/src/lib/google-calendar/events.ts`:

- resolves connection + sync map
- gets valid access token
- for `upsert`:
  - PATCH existing Google event when mapped
  - create new Google event if not mapped or update returns 404/410
- for `cancel`:
  - PATCH status to `cancelled` if a usable Google ID exists
  - otherwise keeps a `pending:` synthetic marker
- writes sync map metadata and connection status fields

### Delete workflow behavior

`apps/medusa/src/workflows/delete-chef-event.ts`:

- runs pre-delete step to cancel Google event (best effort)
- purges sync map + incidents via `purgeChefEventArtifacts`
- then deletes app row

---

## 9) Cancellation Incident Policy (Critical Safety Rule)

### Policy

Google-side cancellation/deletion must **not** auto-cancel app events.

Why:

- accidental Google changes should not silently trigger business state changes
- admin must make explicit decision

### Incident flow

1. Incremental sync sees `event.status=cancelled`
2. creates or updates `google_calendar_sync_incident` (`pending`)
3. UI shows pending incident count
4. Admin action:
   - **Approve**: cancel app event (`updateChefEventWorkflow`) + resolve incident `approved`
   - **Deny**: upsert app state back to Google + resolve incident `denied`

Routes:

- `POST /admin/google-calendar/incidents/:id/approve`
- `POST /admin/google-calendar/incidents/:id/deny`

Files:

- `apps/medusa/src/api/admin/google-calendar/incidents/[id]/approve/route.ts`
- `apps/medusa/src/api/admin/google-calendar/incidents/[id]/deny/route.ts`
- `apps/medusa/src/modules/google-calendar-connection/service.ts`

---

## 10) Admin API Surface

Base routes:

- `GET /admin/google-calendar` -> status + pending incidents
- `DELETE /admin/google-calendar` -> disconnect
- `POST /admin/google-calendar/connect` -> OAuth URL
- `GET /admin/google-calendar/callback` -> token exchange + initial setup
- `POST /admin/google-calendar/resync` -> manual resync trigger (returns `202`)

Resync route behavior:

1. clears `nextSyncToken`
2. refreshes watch (without inline pull)
3. emits `google-calendar.incremental-sync-requested`
4. finds app events in `[now, now+60d]`
5. emits `google-calendar.sync-requested` per event (`upsert` or `cancel`)
6. returns scheduling metadata (`scheduled`, window start/end)

File:

- `apps/medusa/src/api/admin/google-calendar/resync/route.ts`

---

## 11) Admin UI Integration

### SDK + hooks

- SDK resource: `apps/medusa/src/sdk/admin/admin-google-calendar.ts`
- hooks: `apps/medusa/src/admin/hooks/google-calendar.ts`

### UI placement

- store widget (`apps/medusa/src/admin/widgets/google-calendar-store-widget.tsx`) handles connection controls
- chef events calendar page shows incident signal + review drawer and resync action

Files:

- `apps/medusa/src/admin/routes/chef-events/components/chef-event-calendar.tsx`
- `apps/medusa/src/admin/routes/chef-events/page.tsx`

---

## 12) Timezone and Date Handling Rules

Core rule: treat user-entered event date/time as wall-clock in event timezone, then convert consistently.

Important helpers:

- `apps/medusa/src/lib/chef-event-wall-clock.ts`
- `apps/medusa/src/lib/chef-event-datetime-display.ts`

Google mapping:

- `toGoogleEventBody` in `apps/medusa/src/lib/google-calendar/mapping.ts`
- color/status mapping: `apps/medusa/src/lib/chef-event-google-calendar-colors.ts`

Known pitfalls solved:

- date-only ISO interpreted as UTC causing day drift
- inconsistent browser-local vs event-zone rendering
- missing explicit Google status causing hidden cancelled shells not to restore

---

## 13) Operational Runbook

## Initial setup checklist

1. Configure Google OAuth app:
   - redirect URI -> callback route
   - webhook URL -> public HTTPS endpoint
2. Set env vars (including encryption/signing secrets)
3. Run migrations:
   - `yarn workspace medusa migrate`
4. Connect account from admin
5. Confirm watch metadata populated in `google_calendar_connection`
6. Create/update/cancel test event and verify bidirectional behavior

## Health checks

Inspect `google_calendar_connection`:

- `status` should be `active`
- `watchExpiresAt` should be in the future
- `lastSyncError` should be null/empty

Inspect incidents:

- pending incidents indicate blocked Google cancellations awaiting admin decision

## Recovery playbook

- **No Google->app updates arriving**:
  - verify webhook URL reachable publicly
  - verify `watchExpiresAt` and job execution
  - trigger manual resync to re-prime
- **Token failures**:
  - status becomes `reauthorization_required`
  - reconnect through OAuth
- **Stale/missing Google events**:
  - run resync (enqueues pull + bounded app->Google reconciliation)

---

## 14) Porting Checklist for Sibling Projects

Use this as a practical sequence when migrating another project.

1. Copy/port module: `src/modules/google-calendar-connection/**`
2. Register module in `medusa-config.ts` with options/env mapping
3. Port migrations and run them in target DB
4. Port sync libs: `src/lib/google-calendar/**` and wall-clock/date helpers
5. Port routes:
   - `src/api/admin/google-calendar/**`
   - `src/api/webhooks/google-calendar/route.ts`
6. Port subscribers:
   - `google-calendar-sync-requested.ts`
   - `google-calendar-incremental-sync.ts`
7. Port job:
   - `renew-google-calendar-watch.ts`
8. Ensure workflows emit `google-calendar.sync-requested` for domain lifecycle events
9. Port SDK/hooks/UI surface for admin controls and incident review
10. Validate cache/event-bus modules (Redis strongly recommended for production)
11. Configure env vars and ngrok/public URL for local webhook testing
12. Execute end-to-end QA matrix:
    - connect, create, update, cancel, delete, deny/approve incident, resync, reconnect

---

## 15) Design Rationale Summary

- Use event bus and subscribers to keep HTTP handlers fast and resilient.
- Use watch + syncToken together for near-real-time plus correctness.
- Keep Google cancellation behind human approval to protect business state.
- Keep reconciliation window bounded (`now` to `+60d`) to avoid expensive historical scans.
- Keep deletion cleanup explicit (no FK cascade dependence).

---

## 16) Future Enhancements (Recommended)

- Add automated tests:
  - token refresh retries and state transitions
  - mapping/timezone conversions
  - incident policy branches
  - incremental sync 410 handling
- Add richer observability:
  - structured metrics for sync latency, queue depth, failure rates
- Consider replacing lock key with per-connection lock if moving to multi-tenant mode
- Consider idempotency keys per webhook notification for stricter dedup semantics

