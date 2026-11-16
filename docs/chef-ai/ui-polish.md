# Schedule chat UI refinement — PR #36

Owner-requested frontend follow-up, 2026-11-13, on
`feat/chef-admin-ai-schedule-chat-v1`, starting from clean local/remote head
`b13028c071ce38248cdc2123ecde05a2fcb4dc85`. The only production source changed
is `apps/medusa/src/admin/components/chef-chat/chef-chat.tsx`.

## Result

- A content-sized welcome with four immediate-send suggestions: today,
  tomorrow, this week and this weekend. Opening the panel makes no API call.
  A synchronous send guard prevents repeated taps before React renders busy state.
- Compact event cards with distinct status badges, title links and local times.
  Identical-looking requests and cancelled events remain separate entries.
  Each keyboard-accessible Details disclosure retains requested/display intervals,
  appointment, all Scheduling protection intervals, category and recorded timezone.
  Display time is labelled separately from the requested interval.
- A short date-window heading and event count, with exact endpoint times in a
  disclosure. The timezone and inclusive-start/exclusive-end convention remain
  visible, as does the availability caveat. The server's answer text is retained.
- A 490px maximum-width nonmodal panel, capped at 740px / 75dvh, safe-area-aware
  positioning, fixed composer and scrollable history. The welcome grows with its
  content; narrow screens scroll without pushing the composer outside the panel.
  Existing Medusa tokens, components and native disclosures supply light/dark and
  keyboard behavior. No dependency or global mounting changes.

The API request remains exactly `{ message }` for the latest question. Backend,
auth, model prompt, contracts, `b13028c` date/window fix, calendar reads, size/rate
limits and session clearing code are unchanged. There are no new environment
variables. This follow-up does not establish new live-model evidence.

## Validation

Node 26.13.1, Yarn 4.5.0, installed Medusa 2.22.6. Commands run from repository root:

| Command | Result |
| --- | --- |
| `corepack yarn workspace medusa test:unit` | PASS: 30 suites / 272 tests, including 7 React chat tests |
| `corepack yarn workspace medusa typecheck` | PASS |
| `corepack yarn workspace storefront typecheck` | PASS |
| `corepack yarn workspace medusa build` | PASS: backend and production Admin |
| `node docs/chef-ai/ui-polish-acceptance.cjs` | PASS against the built Admin with browser-intercepted synthetic APIs |
| `git diff --check` | PASS |

Commands used the existing Node installation via
`PATH=/tmp/private-chef-node26-tools/node-v26.13.1-linux-x64/bin:$PATH`.
The browser command additionally used
`LD_LIBRARY_PATH=/tmp/bts-browser-libs/root/usr/lib/x86_64-linux-gnu` and
`NODE_PATH=/home/openclaw/projects/bts/node_modules` for the existing browser
libraries and Playwright. No package manifest or lockfile changed.

Tested production source SHA-256:
`7863df04d171754bc7fd94f1f60afb80fe0d37f63bb10521f6dbfdc9d04c00d4`.
Test source SHA-256:
`3cc20602cb80c998a6acea560b2298576b45aa0e6a2a6ddec34cdc89f0213713`.
These identify the exact tested contents independently of the documentation commit.

Component coverage includes all four exact suggestion payloads, no request on
mount/open, same-tick double tap/form race, busy state, keyboard input/composition,
429 retry, distinct status cards, differing requested/display intervals, direct
links and the existing sequential week → weekend → explicit-date payload test.
The full backend suite also retains date, privacy and write-refusal coverage.

The browser harness serves only the real production Admin static assets on local
port 9012. It intercepts auth/calendar/chat and ancillary dashboard requests with
synthetic fixtures and blocks external requests. It checks desktop 1532×1024,
mobile 390×844 and narrow mobile 320×568; first-open behavior, one request on
double tap, message-only payloads, statuses and duplicate entries, exact window
and protection times, keyboard Details, Escape/focus return, navigation/history,
dashboard light/dark toggle, refresh clearing, empty/error states, fixed composer,
scrolling and direct event navigation. No unmocked API routes or page errors.

T3 preview failed twice because host libraries were missing
(`libatk-1.0.so.0`, `libatk-bridge-2.0.so.0`, `libXcomposite.so.1`,
`libXdamage.so.1`, `libXfixes.so.3`, `libXrandr.so.2`, `libasound.so.2`,
`libatspi.so.0`); Playwright used existing unpacked libraries instead. No host
packages were installed. No live backend, database, real login/logout, mobile
software keyboard or paid-model call was tested in this follow-up. Existing
[backend/integration evidence](verification.md) remains historical evidence;
immutable install, storefront build and database integration were not repeated
for this frontend-only change.

## Screenshots (synthetic data)

- [Desktop welcome, dark](ui-polish-evidence/welcome-dark-desktop.png)
- [Compact schedule, dark](ui-polish-evidence/schedule-dark-desktop.png)
- [Expanded factual details](ui-polish-evidence/details-dark-desktop.png)
- [Mobile schedule, light](ui-polish-evidence/schedule-light-mobile.png)

## Owner local repeat test

1. Pull this same branch and rebuild the Admin with Node 26.13.1 / Yarn 4.5.0.
   Use the existing authorized local configuration; no migration or new env is
   needed. Serve the built Admin, then refresh to discard old assets/history.
2. Open Ask Sous Chef: verify four visible suggestions and no chat network call.
   Click a suggestion once; expect one request containing only `message`.
3. Repeat week → weekend → explicit date (for example November 16, 2026).
   Inspect each returned `period`, `range`, `timeZone` and event list. Relative
   windows follow the current business-local date; the UI does not calculate them.
4. Expand the window and event Details. Compare pending, confirmed, cancelled and
   completed records with the calendar; verify requested/display, appointment and
   protection intervals remain distinct. Follow an event title with one click.
5. Close/reopen, navigate to Menus and reopen; history should remain. Check Escape,
   Enter send, Shift+Enter newline, light/dark and a narrow viewport. Refresh and
   logout should clear history. Confirm an empty read never claims availability.

Review only: no merge, deployment, production data/secrets changes or Arbor post.

## Owner-selected name: Sous Chef

The copy-only follow-up from `166176e4503c2273186288346abbb76a7f57db6b`
uses **Ask Sous Chef** for the launcher and **Sous Chef** for the panel title,
with **Read-only schedule assistant** as its scope. Greeting, placeholder, close
label and frontend error copy follow that name. Suggestions, API payloads,
behavior, internal symbols and backend code are unchanged. Browser harness
selectors were updated; screenshots above document the earlier UI-polish build.

Passed on Node 26.13.1 / Yarn 4.5.0:
`corepack yarn workspace medusa test:unit --runTestsByPath src/lib/__tests__/chef-chat-ui.unit.spec.ts`
(7 tests), `corepack yarn workspace medusa typecheck`,
`corepack yarn workspace medusa build` (backend and production Admin), and
`git diff --check`. No new browser, live-model or database run for this copy change.
