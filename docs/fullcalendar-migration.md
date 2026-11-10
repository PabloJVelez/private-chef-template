# PR #33: FullCalendar migration

## Decision and scope

Pabs approved replacing React Big Calendar in the existing `feat/chef-workspace-views`
PR, documenting the decision in Arbor, and pushing the implementation. The starting
head was `706f3d09ba73c174e97dfa57914916c564b9070f`.

[Owner-authorized decision in Arbor](https://arborthreads.com/threads/thr_883fc392-7cfc-4a0f-997a-4847bd310527#c-con_e661fb0069458dd7477797732e4a43ceb56bfd3921ad092a9415b86996ab87b4).

Use FullCalendar **6.1.22**, pinned consistently across its core, React, daygrid,
timegrid and list packages. These are standard MIT packages; no premium license
or interaction/rescheduling plugin is used. React Big Calendar, its type package,
localizer and CSS overrides are removed.

The reference video inspired the visual direction. Its implementation library was
not independently verified. Ticket sales, venues, recurring-session models and
other tutorial business logic were not adopted.

## Delivered behavior

- Month overview with tinted status cards, explicit pending labels, accessible
  date buttons, three visible cards per day and a full overflow popover.
- Read-only Day timeline, including overnight intervals and local DST days.
- Rolling 31-date Agenda, retaining the previous selected-day-plus-30-days meaning.
  Agenda remains the initial mobile view; explicitly selected Month/Day remain usable.
- Compact Medusa toolbar and combined sync/timezone/help strip. Both themes use
  Medusa tokens. Active Google cancellation incidents remain prominent and retain
  their existing review drawer/actions.
- Existing `date`, `view=month`, `view=agenda`, status and incident URLs remain valid;
  `view=day` is added. Date/view updates remain atomic. Browser Back/Forward drives
  the calendar, and native event links still open the existing detail route.
- Keyboard date drilldown and event navigation. Custom Agenda content supplies a
  native button because it replaces FullCalendar's default focusable anchor.
  Event accessible descriptions include requested/appointment and protected time.
- Timezone stays browser-local and labeled; tooltips describe event-zone timing.
  No silent change to chef-zone rendering. Empty calendar space is not availability.

FullCalendar owns the visible interval. Its `datesSet` start/exclusive end are passed
through to the existing bounded API. Requests remain disabled until that interval
matches the URL-selected date/view. Old-range data is hidden during transitions;
late results cannot overwrite a newer range. Loading, failure, incompleteness and
empty success remain separate, with explicit retry.

### Month-boundary correction

The removed Luxon adapter used `firstDayOfWeek: 0`, although its Sunday convention
was 7. November 2026 therefore rendered/read October 18 through November 28, omitting
November 29–30. This inherited bug was missed by the earlier PR review. FullCalendar
uses Sunday=0 correctly and reports **November 1 through December 6 exclusive** for
this month's visible grid. Regression tests assert concrete expected dates, including
both missing dates, rather than merely agreeing with another calculation by the same
adapter.

## What did not change

No API contract, summary-field allowlist, authentication, SQL/read service, database,
reservation, payment, acceptance or notification logic changed. Private Events and
Scheduling remain the write authorities. Dragging, resizing and slot selection are
disabled. No Meal Prep branch was touched. No new booking entity, migration or worker
configuration was introduced. No merge or deployment is part of this delivery.

The existing query-key prefix still supports native mutation invalidation. The only
hook change is the `enabled` gate while FullCalendar establishes its actual range.

## Compatibility notes

Medusa's pinned TypeScript 5.7 NodeNext compilation misclassifies FullCalendar 6's
ESM-only declarations despite its supported CommonJS `require` exports. Narrow,
explained `@ts-expect-error` annotations cover the package's runtime imports; type-only
imports use `resolution-mode: import`. No global compiler relaxation, fake ambient
types, backend ESM conversion or dependency-file patch is used. Vite bundles the
normal ESM imports. Revisit those annotations when TypeScript/FullCalendar is upgraded;
unused annotations fail the typecheck.

The jsdom calendar suites use Node export conditions so Preact resolves its CJS
entry under Jest. They render the real calendar, not a mock. FullCalendar supplies
its own CSS at runtime; only scoped theme/layout overrides remain in the repository.

## Verification

Executed with Node 24.22.2 and repository Yarn 4.5.0:

| Check | Result |
| --- | --- |
| `corepack yarn install --immutable` | Passed; existing unrelated peer warnings remain |
| `corepack yarn workspace medusa typecheck` | Passed |
| `corepack yarn workspace storefront typecheck` | Passed |
| `corepack yarn workspace medusa build` | Backend and Admin frontend passed |
| `corepack yarn workspace storefront build` | Client and server builds passed |
| `corepack yarn workspace medusa test:unit` | 20 suites / 186 tests passed |
| `TZ=America/Chicago corepack yarn workspace medusa test:unit` | 20 suites / 186 tests passed |
| Built Admin browser fixture | Nine scenario groups passed, no page runtime errors |
| Targeted ESLint | No errors in changed production TS/TSX; three test files ignored by existing configuration |
| `git diff --check` | Passed |

Browser coverage: exact November range and missing dates; intervals crossing the
range start; busy-day popovers; light/dark; keyboard drilldown/detail; URL Back/Forward;
23-hour and 25-hour DST days; overnight service; legacy Agenda links; status filters;
empty results; rapid navigation with a late response; unavailable/incomplete/retry;
390px mobile Agenda and Month without horizontal page overflow.

### Browser reproduction and evidence

The host lacked Chromium libraries. Tests ran in the already available
`mcr.microsoft.com/playwright:v1.56.1-noble` container with Playwright 1.56.1,
a task-owned loopback static server, and the actual production Admin build.

Run [browser-smoke.cjs](evidence/fullcalendar/browser-smoke.cjs) from the repository
root after building Medusa. Provide `PLAYWRIGHT_MODULE` if Playwright is installed
outside this checkout. `CHROMIUM_EXECUTABLE` is an optional local-browser override.
The harness serves the built assets on an ephemeral loopback port, closes its browser
and server in `finally`, and writes screenshots/results into this evidence folder.
It requires no application credentials, database or live service.

- [Machine-readable browser result](evidence/fullcalendar/browser-results.json)
- [Light month](evidence/fullcalendar/month-light.png)
- [Dark month](evidence/fullcalendar/month-dark.png)
- [Day timeline](evidence/fullcalendar/day-dark.png)
- [Overflow popover](evidence/fullcalendar/overflow-dark.png)
- [Mobile Agenda](evidence/fullcalendar/mobile-agenda.png)
- [Mobile Month](evidence/fullcalendar/mobile-month.png)
- [Failure](evidence/fullcalendar/error.png)
- [Incomplete](evidence/fullcalendar/incomplete.png)

**Limits:** the browser uses synthetic calendar/API responses and stubbed Admin
identity/store/Google status. This proves the built UI and request contract, not live
authentication, provider synchronization, real database performance or owner-data
acceptance. Existing database/auth integration evidence in the original delivery
note is historical; those unchanged backend suites were not rerun for this renderer
migration. The prior exact-head PR review does not cover this change. The shared
review worker remains disabled.
