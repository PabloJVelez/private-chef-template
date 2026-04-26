# Manual QA Checklist — Google Calendar Integration MVP

## Preconditions
- Google OAuth app configured with valid redirect URI and webhook URL.
- Backend has Google env vars set (`GOOGLE_CALENDAR_CLIENT_ID`, `GOOGLE_CALENDAR_CLIENT_SECRET`, `GOOGLE_CALENDAR_REDIRECT_URI`, `GOOGLE_CALENDAR_SIGNING_SECRET`, `GOOGLE_CALENDAR_TOKEN_ENCRYPTION_KEY`).
- One admin account is available in Medusa Admin.

## Connection Lifecycle
- [ ] Open Admin store details and verify Google Calendar widget renders.
- [ ] Click **Connect Google Calendar** and complete OAuth flow successfully.
- [ ] Confirm widget status becomes **Connected** and calendar ID is shown.
- [ ] Click **Disconnect** and confirm status returns to **Not connected**.
- [ ] Reconnect and confirm connection state can recover after disconnect.

## App -> Google Sync
- [ ] Create a chef event in admin and verify sync map row is created.
- [ ] Update event schedule/location/notes and verify sync state remains linked.
- [ ] Mark event cancelled and verify mapped Google event status is `cancelled`.
- [ ] Mark event completed and verify sync request is emitted without errors.

## Google -> App Sync
- [ ] Edit linked Google event time/location/description.
- [ ] Trigger webhook and verify app event updates requestedDate/requestedTime/timeZone/locationAddress/notes.
- [ ] Verify last-write-wins behavior: when app is newer than Google, app changes are preserved.
- [ ] Simulate invalid `syncToken` (`410`) and confirm full resync path completes.

## Silent Updates and Safety
- [ ] Verify sync writes use silent update behavior (no attendee notification side effects).
- [ ] Verify webhook rejects invalid channel token values.
- [ ] Verify unmatched/unlinked Google events are ignored by app update path.

## Observability
- [ ] Confirm logs include successful webhook processing entries.
- [ ] Confirm sync failures set connection state to `sync_error` and record `lastSyncError`.
- [ ] Confirm recovery (resync) clears error state and updates `lastSyncedAt`.
