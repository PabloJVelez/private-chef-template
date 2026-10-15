# Live chef availability

Settings → Availability owns chef timezone, weekly working windows, date overrides and Google conflict mode. Hours start unconfigured: no opening hours are invented. Empty date overrides close a date; nonempty overrides replace that weekday's hours. Split overnight windows across dates.

Experience Types owns duration, off-site preparation, travel each way, additional cleanup, advance notice and arrival restrictions. Duration runs from chef arrival to the end of the experience and includes on-site preparation. Occupied time starts preparation + travel minutes before arrival and ends cleanup + travel minutes after the duration. The entire occupied interval must fit a working window. The existing six-month horizon is calculated server-side in the chef timezone.

The four-step request journey selects canonical UTC slots, including distinct offset-labelled choices during autumn DST folds. Date/experience changes clear stale selections. Spring-forward nonexistent times are not offered. Submission and acceptance revalidate against current settings, internal bookings and Google conflicts.

## Reservation and acceptance policy

Provisional policy: pending requests do not reserve time; accepted bookings do. No payment deadline, automatic expiry or cancellation policy is introduced. Stripe and digital shipping/ticket behavior remain in place.

An acceptance operation first atomically claims its occupied interval while the request remains pending. This short operational claim prevents concurrent acceptance; it is not a hold created by submitting a request. PostgreSQL's GiST range exclusion constraint enforces half-open interval conflicts across all writers. The chef-event module performs its own claims through Medusa's injected transaction manager; it does not write another module's tables. The availability module owns settings, and orchestration uses workflows and other modules' services.

Ticket products are created as drafts and cleaned up with Medusa's product-deletion workflow if inventory setup fails. The event becomes confirmed only after ticket setup. Compensation releases only the owned, still-pending claim. Finalized bookings and ticket products survive downstream notification failures.

Accepted duration/buffers/timezone are snapshotted. Direct confirmation and accepted rescheduling are blocked at the database boundary, including inbound Google writes. For a different schedule, cancel and create a new request. A worker interrupted during acceptance may leave a claim/draft product for operator review; there is intentionally no automatic lease expiry. Inspect workflow state, event status, product/inventory and any payments before recovery. Never release a claim while its worker could still finalize. Do not roll back a confirmed booking merely because notification delivery failed.

## Google integration

The existing connection, encrypted tokens, callbacks, sync maps and reconnect flow are reused. The Store settings widget links to Availability so the old destination remains useful. No live authorization or scope expansion was performed.

Availability uses paginated **Events list** under the existing `calendar.events` grant. FreeBusy aggregates do not identify individual events, making it unsafe to subtract a pending mirror from an overlapping personal appointment. Instead, only verified sync-map IDs for pending requests are ignored; unrelated overlapping events remain busy. This also handles legacy opaque pending mirrors before they are resynced. New pending mirrors are transparent. All-day events and recurrence instances are included. Only the connected calendar is checked.

Missing connections, authorization failures, malformed responses, timeouts and pagination failures block offered slots when Google is required. Internal-only mode is an explicit chef choice. Transient token outages produce a sync error; permanent refresh failures require reconnecting. Accepted schedule changes from Google fail closed with an actionable sync error. Restore the original Google time to resume sync, or cancel and create a new request through the app. Google and PostgreSQL cannot share an atomic transaction: an external calendar edit can still race with approval.

## Migration and manual-test checklist

1. Back up the target database. Audit legacy booking instants/timezones/durations and resolve overlapping confirmed/completed records. The migration intentionally fails on missing durations or existing overlaps. Legacy snapshots preserve the existing duration with zero extra buffers; review those values before rollout.
2. Apply the three new module migrations using the normal Medusa migration process. Do not run reset/initialization scripts against existing data. The chef migration also ensures chef-owned timezone/experience fields exist on fresh installations, regardless of historical cross-module migration order.
3. Configure timezone and working hours; review each experience's duration, buffers, notice and arrival restrictions. Start local tests in explicit internal-only mode with disposable fixtures. For Google testing use a dedicated test calendar and authorized test connection, never a live client calendar.
4. Check closed weekdays, closed dates, exceptional open dates, buffer boundaries, DST folds/gaps, and stale submissions. Submit two overlapping requests and accept concurrently: exactly one may claim the interval. Repeating acceptance must not create another product or email.
5. Check ticket inventory, approval-email preferences, request-before-payment and the existing Stripe checkout manually. Exercise cancellation and an inbound Google schedule edit. Reconcile pending mirrors to transparent through normal synchronization when convenient.

## Verification and portability

Run `yarn workspace medusa test:unit`, both workspace `typecheck` commands and both workspace builds. The isolated PostgreSQL suite is `yarn workspace medusa test:integration:http availability-concurrency` with an explicit `AVAILABILITY_TEST_DATABASE_URL`. It creates/drops only a uniquely named schema and never defaults to the application's database URL. It covers all three new migrations and the actual module claim/release queries.

The current workspace's `medusa lint` script cannot find root-installed ESLint; from `apps/medusa`, use `../../node_modules/.bin/eslint .`. Existing repository warnings remain.

Port module registration, models/migrations, claims/constraints, workflows, experience schemas/SDKs, Google handling, Settings UI and storefront canonical slot fields together. Audit each client database separately. Preserve its OAuth configuration and digital shipping/Stripe setup. Neither client repository, production migrations nor deployment is included here.

References checked against installed Medusa 2.7 conventions: [module transactions](https://docs.medusajs.com/learn/fundamentals/modules/db-operations), [Settings routes](https://docs.medusajs.com/learn/fundamentals/admin/ui-routes), and [Google Events list scopes/pagination](https://developers.google.com/workspace/calendar/api/v3/reference/events/list). Transaction imports use `@mikro-orm/knex`, as required before Medusa 2.11.

### Validation in the implementation workspace

- Unit suite: 93 passing tests across 8 suites (including DST, overrides, buffers, Google failures and acceptance compensation).
- PostgreSQL: 6 passing tests in a disposable cluster, including real module claim/release SQL, concurrent overlap rejection and migration guards.
- Medusa and storefront typechecks and production builds passed.
- ESLint via the root binary: zero errors, 205 warnings. The workspace lint script itself remains blocked by its existing binary-resolution issue.
- `git diff --check` passed. New source files were formatted; existing file styles were preserved where practical to reduce unrelated diff noise. Medusa's parameter decorators require a formatter that supports legacy TypeScript decorators.
- Browser QA was attempted with a localhost fixture harness, but the in-app browser was unavailable and native-browser control stopped when the active window changed. Visual and end-to-end payment checks remain manual. No live Google calendar or Stripe account was used.
