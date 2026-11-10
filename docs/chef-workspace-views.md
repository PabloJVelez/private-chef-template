# Chef Workspace read views — BTS-13

Baseline: `f5d6c8de95eddfaeb6a12c9965c424ead8e5518a` (PR #32), parent
`e2dcc9bd44406a4c963c6fb85aed1998089cfb74` (PR #31). Verified clean in the T3-bound
`feat/chef-workspace-views` checkout and against freshly fetched `origin/main`.

Controlling brief: [BTS-13](https://arborthreads.com/threads/thr_883fc392-7cfc-4a0f-997a-4847bd310527#c-con_de7a982725476bb6f8a465cb255069abf447323bcb1e26c0f07d9b0a107f76d9).

## Ownership and behavior

Private Events is the only source. `RequestSummary`, `RequestPage`, `CalendarEntry`
and `CalendarResult` are read-only presentation contracts with an explicit Private
Event mapper. IDs are `private-event:<native ID>`; navigation uses the existing
`/chef-events/<native ID>` detail route. Native pending/confirmed/cancelled/completed
statuses remain intact. There is no new persisted entity, lifecycle, registry or
command dispatcher.

Medusa 2.7's normal authenticated `/admin` routing protects both new GET endpoints:

- `/admin/chef-workspace/requests`: real native module `listAndCount` pagination;
  default 20, maximum 100, offset 0–1,000,000, ordered by `requestedDate ASC, id ASC`.
  Supports existing status/statuses, eventType, locationType and name/type search.
- `/admin/chef-workspace/calendar`: requires offset-aware ISO `start`/`end`, a
  positive range of at most 62 days. A service-owned parameterized SQL query uses
  half-open interval overlap, including events beginning before the visible range.
  It applies per-event duration, the existing legacy 60-minute display estimate,
  soft deletion and filters in PostgreSQL, with a five-second statement timeout.
  It returns complete results through 5,000 events; a larger result explicitly
  returns `complete: false` and no entries. The SDK turns that into an actionable
  error. The browser request also has a 15-second timeout.

The existing `/admin/chef-events` list retains its original response shape and
now uses the same validated paging bounds, filters and stable order. Detail and
mutation endpoints and the acceptance SDK are unchanged.

Summary selection is allowlisted: native ID/status, event type, display name,
requested instant, duration and timezone. It excludes email, phone, address,
dietary requirements, notes, pricing, attribution, acceptance tokens and email
history. Names remain because the existing calendar identifies events by host.

`requestedTime` represents requested display timing; `appointmentTime` is populated
only for confirmed/completed events. `protectedTime` comes independently from
Scheduling's existing held/confirmed reservations, never from event status or a
cached occupied interval. Released reservations are omitted. These are read
projections, not an availability decision or reservation authority. Protection is
shown in tooltips on the existing event, not as a second calendar of busy blocks;
the queried range concerns the displayed request/appointment intervals.

The baseline UI had month and agenda views, not a separate inbox table. The owner
subsequently approved replacing React Big Calendar with FullCalendar in this PR.
See [the migration decision, verification and browser evidence](fullcalendar-migration.md).
Month, Day and a rolling 31-date Agenda reuse the same summary API. FullCalendar's
actual visible start/exclusive end drive the query, including month padding and DST.
Existing `view=month` and `view=agenda` links remain supported; `view=day` is new.
Titles/grid times use the labeled browser timezone; tooltips show explicitly zoned
event/request and protected times. Pending requests are labeled, not presented as
confirmed appointments. No second screen, inbox or write authority was added.

Changing range/filter never carries a prior range's results forward as current.
Failures and incomplete responses show an alert/retry state, not an empty success.
Month date headings are keyboard-accessible day-view buttons; their date/view URL
update is atomic. Status URLs remain intact. A selected Google cancellation
incident retrieves its existing detail independently, including outside the range.
Existing event mutations invalidate the shared `chef-events` query prefix.

Reads do not claim/release time, execute workflows, create products or send email
or Google changes. All edits, Accept, Reject and Cancel remain service-owned on
the existing typed Private Event detail APIs/workflows. No schema migration,
index or workflow YAML change was introduced. Calendar dependencies changed as
documented in the migration note.

## Original read-view validation (706f3d0; historical)

Commands below ran from the repository root unless otherwise stated. The checked-in
Yarn executable was used because the host has no global `yarn` executable.

| Command | Result |
| --- | --- |
| `node .yarn/releases/yarn-4.5.0.cjs install --immutable` | Passed; lockfile unchanged |
| `node .yarn/releases/yarn-4.5.0.cjs workspace medusa typecheck` | Baseline and final passed |
| `node .yarn/releases/yarn-4.5.0.cjs workspace medusa test:unit` | 19 suites, 181 tests passed |
| `node .yarn/releases/yarn-4.5.0.cjs workspace medusa test:unit --runTestsByPath src/lib/__tests__/chef-workspace.unit.spec.ts src/lib/__tests__/chef-workspace-ui.unit.spec.ts src/lib/__tests__/chef-event-calendar-status-params.unit.spec.ts src/lib/__tests__/acceptance-sdk-retry.unit.spec.ts` | Final affected-path run: 4 suites, 25 tests passed |
| `BOOKING_TEST_DATABASE_URL=postgres://postgres@127.0.0.1:55436/postgres node .yarn/releases/yarn-4.5.0.cjs workspace medusa test:integration:http --runTestsByPath integration-tests/http/chef-workspace.spec.ts integration-tests/http/booking-scheduling.spec.ts` | Both process wrappers passed: 5 new workspace cases and 5 existing Scheduling cases |
| Same integration command with only `integration-tests/http/chef-workspace.spec.ts` | Final workspace rerun passed after query validation refinements |
| `node .yarn/releases/yarn-4.5.0.cjs workspace medusa build` | Backend and Admin frontend passed |
| `node .yarn/releases/yarn-4.5.0.cjs workspace medusa lint` | Script could not find the ESLint executable in the workspace PATH |
| `node ../../node_modules/eslint/bin/eslint.js .` from `apps/medusa` | Passed with 0 errors and 229 warnings |
| `git diff --check` | Passed |

The integration fixture uses the repository's existing `bookingApp` harness, real
Medusa modules/migrations, a task-owned loopback PostgreSQL container and uniquely
named test databases. The HTTP tests use Medusa's real `ApiLoader`, including its
authentication middleware. No shared/owner database or Redis was reset or used.

Coverage includes anonymous/customer denial, malformed queries, privacy, stable
IDs, unchanged event/reservation/attempt rows after reads, half-open boundaries,
crossing intervals, pending holds versus appointments, released protection,
1,005 tied-date records across 11 list pages, 1,005 complete calendar results,
5,001-record incompleteness, literal search escaping and an actual PostgreSQL lock
that causes the calendar read to time out. UI tests exercise the real calendar,
React Query and Router, including loading/error/empty/retry, URL filters, native
detail navigation, date drilldown and an incident outside the visible range.
Range tests compare with the installed month/agenda implementations across DST.

No baseline typecheck failures were found. ESLint's repository plugin is newer than
the pinned framework: its Zod/MikroORM import suggestions target exports absent in
Medusa 2.7. New code follows installed conventions. The browser SDK intentionally
throws a browser `Error` for incomplete reads rather than bundling server error
utilities. No unrelated lint rewrites were made.

## Original read-view browser evidence and limits (historical)

T3 preview could not start because the host lacks browser libraries (`libatk`,
`libatspi`, `libXcomposite` and others). A task-owned Selenium/Chrome container was
used instead. `python3 /tmp/chef-workspace-browser.py` opened the session;
`python3 /tmp/chef-workspace-smoke.py` exercised the built Admin frontend.

Browser smoke passed for desktop month/agenda, date drilldown, bounded network
requests, existing detail URL, status filtering, empty range, failed/incomplete
range, retry and the mobile default agenda. Screenshots use synthetic fixture data:

- [Desktop month](evidence/chef-workspace/month.png)
- [Desktop agenda](evidence/chef-workspace/agenda.png)
- [Mobile agenda](evidence/chef-workspace/mobile.png)
- [Read failure](evidence/chef-workspace/error.png)
- [Explicit incomplete range](evidence/chef-workspace/incomplete.png)

The browser served this branch's production build with real Private Event/module
reads on its own database. Admin shell identity/store endpoints and Google status
were stubbed; failure/incomplete responses were injected for UI testing. This was
not a full logged-in Medusa deployment or live Google/email/payment check. Real
server auth was tested separately through the installed Medusa HTTP loader.

The full Redis/native commerce crash/retry suite was not rerun for this read-only
change. Existing acceptance SDK retry tests and Scheduling integration regressions
passed. Owner-supplied backend QA from PRs #31/#32 remains prior evidence, not tests
performed here. No production/demo deployment or external messages occurred.

## Focused owner acceptance

Use the owner's normal local application, existing PostgreSQL/Redis database and
normal migration workflow. This PR adds no migration and needs no fixture resets.

1. Open `/app/chef-events`. Confirm Month/Day/Agenda views, status filters,
   default pending/confirmed selection and labeled timezone. Navigate Back/Next,
   switch views and use a month date button. Inspect network requests: each calendar
   read has `start`/`end`, not a whole-history `limit=1000` query.
2. Open an event from month and agenda. Confirm the existing detail URL and forms.
   Pending labels describe requests; tooltips show protection only when Scheduling
   actually holds/confirms it. No additional acceptance/cleanup QA cycle is required.
3. In an authenticated API client, request `/admin/chef-workspace/requests?limit=20&offset=0`
   and offset 20. Check ordered, distinct IDs and count; `limit=101` should fail.
   An unauthenticated call to either workspace endpoint should return 401.
4. Find an empty date range. It should show an empty agenda without an error. In
   browser devtools, block the calendar GET and navigate: expect an unavailable
   alert, not an apparently empty success. Unblock and Retry to recover.

Offset pages are deterministic for unchanged data; concurrent edits/inserts can
shift pages as with standard Medusa offset pagination. Calendar completeness is
separate and uses one bounded event query, not an offset-page accumulation. These
ordinary read projections do not promise an atomic cross-module snapshot.

## Separately tracked / unchanged

BTS-14 price ambiguity, BTS-15 status-only save, BTS-16 SYS-CHEF-CHARGE prerequisite,
BTS-17 storefront type display and BTS-19 omitted text-field create failure remain
outside this change. The prior unavailable-arrival toast timing observation is not
an open defect. Obsolete starter YAMLs remain retired (BTS-18); OpenClaw review
workflows are preserved.

## Original read-view handoff (historical)

Implemented the reduced Medusa-first BTS-13 foundation for Private Events only:
small typed request/calendar read contracts, explicit Private Event mapping,
authenticated stable list pagination, complete bounded calendar reads with explicit
failure/incomplete states, and reuse of the existing month/agenda/detail routes.
Scheduling remains the reservation authority; Private Event workflows remain the
write authority. Automated data-access/auth/UI regressions and fixture browser
smoke passed. No new service, migration or deployment. Ready for PR review; Arbor
posting is left to the owner/ChatGPT.
