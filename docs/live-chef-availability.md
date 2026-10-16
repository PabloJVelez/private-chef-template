# Live chef availability

Availability in the primary sidebar owns chef timezone, weekly working windows, date overrides and Google conflict mode. Hours start unconfigured: no opening hours are invented. Empty date overrides close a date; nonempty overrides replace that weekday's hours. Split overnight windows across dates.

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

Port module registration, models/migrations, claims/constraints, workflows, experience schemas/SDKs, Google handling, Availability UI and storefront canonical slot fields together. Audit each client database separately. Preserve its OAuth configuration and digital shipping/Stripe setup. Neither client repository, production migrations nor deployment is included here.

References checked against installed Medusa 2.7 conventions: [module transactions](https://docs.medusajs.com/learn/fundamentals/modules/db-operations), [admin routes](https://docs.medusajs.com/learn/fundamentals/admin/ui-routes), and [Google Events list scopes/pagination](https://developers.google.com/workspace/calendar/api/v3/reference/events/list). Transaction imports use `@mikro-orm/knex`, as required before Medusa 2.11.

### Validation in the implementation workspace

- Unit suite: 93 passing tests across 8 suites (including DST, overrides, buffers, Google failures and acceptance compensation).
- PostgreSQL: 6 passing tests in a disposable cluster, including real module claim/release SQL, concurrent overlap rejection and migration guards.
- Medusa and storefront typechecks and production builds passed.
- ESLint via the root binary: zero errors, 205 warnings. The workspace lint script itself remains blocked by its existing binary-resolution issue.
- `git diff --check` passed. New source files were formatted; existing file styles were preserved where practical to reduce unrelated diff noise. Medusa's parameter decorators require a formatter that supports legacy TypeScript decorators.
- Browser QA was attempted with a localhost fixture harness, but the in-app browser was unavailable and native-browser control stopped when the active window changed. Visual and end-to-end payment checks remain manual. No live Google calendar or Stripe account was used.

### Availability navigation

Availability is a top-level admin page at `/app/availability`, placed immediately
below Events using the existing primary-sidebar menu configuration. Working hours,
date exceptions and Google Calendar controls remain together on this page. Events,
the Store shortcut and the Google OAuth return path all use this canonical URL.
The former `/app/settings/availability` URL is no longer supported; update saved
bookmarks. There is no custom Settings route, dashboard dependency patch or Medusa
version upgrade.

After pulling, run `yarn install --immutable` at the repository root to remove the
previous dependency patch, then restart your local Medusa dev process and reload
the admin. Rebuild first if serving a production build. No database migration is
needed for this navigation change. The agent did not restart the manual-test server.

Routing tests exercise unpatched Medusa 2.7's generated routes, its shipped source
route-building method and React Router, including direct navigation and the primary
sidebar target. Component imports are stubbed, so these tests do not establish
visual browser or backend API coverage.

Navigation-change validation: all 97 unit tests (9 suites), Medusa typecheck,
backend/admin production build, changed-file ESLint and `git diff --check` passed.
The dependency manifests match the pre-patch feature baseline. Browser automation
reported no connected browsers; direct navigation and primary-sidebar navigation
were verified through the generated route tree and React Router, not a visual click.

### Chef-facing availability editor

The primary-sidebar page now groups the usual week, days off/special hours, saved
arrival-time preview and Google controls. Weekday switches remember that day's
in-progress hours when toggled off and on. New hours start blank. Copying into days
with existing hours requires explicit replacement confirmation. Split periods remain
supported, with the same server constraints (12 periods/day; no overlaps or overnight
periods; touching periods allowed).

The date editor supports one date or an inclusive range. Opening a duplicate date
loads its existing hours instead of closing it. Ranges that touch existing exceptions
require explicit replacement, and the draft cannot exceed 366 exception dates. Apply
to draft stages the changes; the sticky Save bar persists them. Use weekly hours
removes an exception. Discard restores the last successfully saved schedule.

The timezone field uses searchable native suggestions with city names and timezone
identifiers. Browser-specific picker appearance and keyboard behavior still need
manual visual QA. Save is disabled for invalid hours/timezone or unfinished copy/date
editors. Background refreshes never replace a loaded draft. Save completions update
the saved snapshot while retaining any newer edits made during the request; failures
retain the draft. Refresh/close warns when edits are unsaved.

`GET /admin/availability/preview` uses standard admin authentication and the existing
`availableSlots` server calculation. It returns only timezone, selection identifiers
and arrival labels/instants; no customer or calendar-event details. Preview is clearly
labeled as saved schedule, refreshes after saving, and separates empty results from
lookup errors. Query keys and selection checks prevent late responses from showing
slots for the wrong date or experience. No client-side booking calculation, payment
policy, schema migration or dependency patch was introduced.

Redesign validation: 113 unit tests across 12 suites passed, including six rendered
React/jsdom interaction tests and new editor/API tests. Coverage includes replacement
consent, duplicate/range exceptions, off/on preservation, save failures and edits during
save, background refresh, dirty preview, stale responses and preview refresh after save;
existing timezone/DST and booking-conflict tests also passed. Medusa typecheck and
backend/admin production builds passed. Changed-file ESLint has zero errors and one
existing-style Zod import-source warning. Browser discovery returned no connected
browsers; jsdom tests do not establish visual browser QA.

Manual review after pulling: open `/app/availability` at desktop and narrow widths;
set a split weekday, toggle it off/on, copy into an existing day with replacement;
edit a duplicate exception and an overlapping date range; save/discard; choose an
experience/date and compare the saved preview before/after a schedule change. Verify
timezone suggestions, keyboard focus, sticky Save and the Google connection warning.
No migration or special install command is needed for this redesign. Restart/rebuild
only your local app as needed; the agent did not restart the manual-test server.

### Additive working days and storefront availability calendar

This pass supersedes the seven weekday switches described above. Only configured
weekdays are shown. An empty schedule starts with one uncommitted day selector;
choosing a day creates blank hours, never default bookable hours. Add working day
excludes weekdays already present. Removing a day makes it unavailable. Existing
saved schedules, split periods, copy-hours confirmation, exceptions and Save/Discard
remain supported. Omitted days are explicitly described as unavailable.

`GET /store/availability/calendar?experience_id=…&month=YYYY-MM` returns at most one
month of `{ date, available }` flags, the chef timezone and booking bounds. Omitting
month starts at the first bookable month. It shares the authoritative slot calculator
with daily lookup, including advance notice, six-month horizon, experience duration,
preparation/travel/cleanup, weekly windows, date overrides, accepted/in-flight internal
bookings and Google conflicts. Internal records and Google range lookup are reused
across the month, with pagination inside those reads. Google failures return 503;
closed/out-of-bounds months can return no dates without querying Google. No calendar
or customer event details are returned by the month endpoint. The storefront proxy
uses the existing publishable API key. Server responses use `Cache-Control: no-store`.

The actual `/request` builder uses the month summary to disable unavailable dates.
It supports bounded previous/next month navigation, Tab/arrow-key operation, empty,
loading and failure states, and explicit refresh. A component-local 20-second cache
reduces repeated month navigation; refresh and remount discard it. Daily slots are
still fetched on date choice and when returning to scheduling. A valid saved UTC
arrival survives revalidation; an unavailable one is cleared with an explanation.
A lookup failure retains the choice but prevents continuation until a successful
retry. Date or experience changes invalidate the choice. Review displays the server's
arrival label (including the applicable offset) and chef timezone. Missing catalog
or experience IDs prevent progression and show recovery guidance. Forward step
navigation cannot skip required fields. Submission and acceptance still revalidate
on the server; pending requests still do not reserve slots. Payment and expiry
policies are unchanged.

Validation for this pass: 119 Medusa tests across 13 suites and nine storefront
React/jsdom tests passed. These include configured/blank/add/remove/move weekday
rows, duplicate prevention, discard, month limits, shared Google reads, open overrides,
closures, buffers, accepted versus pending bookings, DST fold offsets, lookup failure,
keyboard navigation, late responses, and the real request builder's retained/stale/
failed arrival revalidation and timezone review. Both typechecks and both production
builds passed. Changed-file ESLint reported zero errors and six warnings from the
repository Medusa rules (Zod import source and generic errors). The Medusa build
required permission for the bundler's temporary local port; its rerun passed.

Browser QA remains partial: a loopback-only fixture loaded the real editor and request
components without backend/calendar calls. Adding a day exposed duplicate React in
that mixed fixture; after applying fixture-only deduplication the browser could no
longer reach localhost, so visual/interaction QA was not completed. The fixture is
not shipped. No real booking was submitted and no live Google calendar was accessed.

For manual testing, pull this commit and rebuild/restart the template's backend/admin
and storefront. This incremental pass adds no migration, environment variable or
package dependency. Check `/app/availability` with a saved split schedule and an empty
schedule, then `/request` with a configured active experience. Check a closed date,
open override, fully booked date, month boundary, timezone offset, return from review,
and retry after calendar failure. Desktop and narrow-width visual QA remain required.
When porting later, include the shared query refactor, calendar API and proxy, schema,
request components, working-day editor and tests together; first confirm each client's
base availability migrations and accepted-booking backfill from the earlier checklist.
