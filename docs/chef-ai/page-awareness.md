# BTS-21: page-aware targeting and grounded replies

This follow-up stays on PR #38, branch `feat/sous-chef-pending-time-edit-ui-v1`, stacked on PR #37. The managed worktree and origin were clean at `fb1db79b9ba651d23f215b66d6f82662db225d1f` before changes. External navigation commits `b33d8a6` and `fb1db79` are preserved. No merge, deployment, production flag/secret or shared database changes.

Tested implementation commit: **`59c8aaf435d8cfc4715bf620608271bed15b0272`**. The following documentation-only commit records the exact SHA and hosted evidence check; executable code and recorded assets are unchanged.

**[Watch/download the actual UI recording (WebM, 25.72 seconds)](https://github.com/PabloJVelez/private-chef-template/raw/59c8aaf435d8cfc4715bf620608271bed15b0272/docs/chef-ai/pending-ui-evidence/page-awareness.webm)** — repository access required. The GitHub-hosted file was retrieved through the authenticated GitHub API and matched the committed recording byte-for-byte: **1,594,264 bytes**, SHA-256 `3827b76e763804c3c06768128a34240e3e9b511be1d14ee197f1dbecc6ceda9b`. Chromium decoded it at **1280×900**, advanced during playback and sought to **23.72 seconds** with no media error. This is a committed downloadable/playable artifact, not a claim of GitHub-native attachment upload or an anonymously public URL.

## Targeting and presentation

The globally mounted assistant reads `useMatches()` and a namespaced `handle.sousChef` descriptor. Existing Medusa labels, permissions and breadcrumbs stay intact. Private Event and Menu detail routes provide typed descriptors; Menu has **no AI write capability**. Unknown pages are generic. Only Medusa's one generated unannotated empty leaf may inherit a descriptor; other descendants terminate it. Future same-path unsupported surfaces must explicitly set `sousChef: null`. No page DTO, DOM text, unsaved form field, contact details or arbitrary URL enters the hint. Both the actual installed Medusa 2.22.6 generator and a real data router with a custom basename are tested; built Admin uses `/app`.

The four lifetimes are independent: route-derived hint, in-memory conversational focus, five-minute unfinished edit task, and actor/backend/event-scoped attempted-write reference. Visible turns contain presentation snapshots, not reusable targeting context. Navigation (including same URL and back/forward), identity/backend change, chat close, a new question and stale responses consume or invalidate focus. Attempted-write recovery survives navigation as before.

For implicit references, the server validates the closed page-hint schema and re-fetches the Private Event under existing authenticated single-store Admin access. Page B alone resolves B; page B plus fresh discussion of A asks **“The event open on this page, or the event we just discussed?”** and returns verified choices with names, local dates/times, statuses and ID discriminators. No preview occurs before a choice. Page B plus chat B resolves one current record. A past `selectedId` does not override a new conflict. Explicit candidate selection/manual editing may deliberately choose A while viewing B; explicit date-target lookup keeps its existing bounded route. Missing/inaccessible/deleted page records fail closed without falling back to A. Nonpending targets refuse; they are not substituted with a pending record.

The preview response now includes a bounded target name/ID/status/revision from the **same authoritative database snapshot** used to sign the event ID and expected revision. The client validates the target ID/revision against the preview before displaying **Editing: [name]**, saved local arrival, ID discriminator and live link beside the before/after panel. The preview request still accepts only `{eventId,date?,time?}`. Confirm/recover still accept only `{reference}`. The new metadata is additive; no signing, workflow, route denial, concurrency or authorization check was relaxed. A title is display-only and never a selector; no contact/address/notes are added.

Schedule reads have a small typed presentation contract. A deterministic composer uses recorded requested arrival for pending events and appointment time for confirmed/completed events, in the saved zone. One event appears as a concise sentence and trusted inline link; several appear as short rows. Full details stay collapsed. Historical snapshots remain labeled, and no free-time, availability or Google-sync conclusion is invented. All titles render as escaped React text. There is still exactly one provider call, selecting one of the existing two fixed schemas, with only the latest question and existing fixed business-date/schema context. The model does not receive page hints, event records, IDs, previous messages or signed references.

## Evidence and limits

- RED: the pre-change resolver test returned `event-A` for page B plus fresh A context. See [recorded failure](pending-ui-evidence/page-awareness-red.txt). GREEN: resolver, rendered data-router, actual SDK/Medusa HTTP and built-Admin fixtures now require explicit choice.
- **39 unit suites / 443 tests passed**, plus **46 final rendered checks** after presentation formatting. Includes the installed Medusa generator, custom basename/empty leaf/unsupported descendants/Menu descriptor, hostile title escaping, requested-vs-appointment time, stale focus and verified preview identity mismatch.
- **60 real Medusa HTTP/PostgreSQL cases passed**, including provider-wrapper → route → installed SDK → shared UI state → dedicated preview and signed-reference event/revision agreement for both A and B choices. The model network boundary is mocked.
- **5 persistent Redis/process recovery cases passed**, including all nine unchanged generic-workflow HTTP 403 scenarios. Related workspace/booking/scheduling wrappers and availability constraints also passed. Test-only containers were removed.
- Medusa/backend/Admin and storefront typechecks and production builds passed; `git diff --check` passed. Admin lint reports the existing 176 warnings, zero errors.
- Prior built-Admin suite: light/dark, desktop/expanded and 320/390px mobile; 32 previews, 5 explicit confirmations, 2 recoveries, zero browser errors/unmocked routes. The new walkthrough has **2 previews, 0 confirmations, 0 recoveries**, zero browser errors/unmocked routes.
- **No live OpenAI interpretation test was performed.** The recording uses built Admin assets with synthetic API responses and a visible fixture/mock/no-saves label. It is actual browser footage, not a slideshow. Owner acceptance with the configured live model remains necessary before production enablement.

T3's browser failed with: “This host is missing libraries T3's browser needs (libatk-1.0.so.0, libatk-bridge-2.0.so.0, libXcomposite.so.1, libXdamage.so.1, libXfixes.so.3, libXrandr.so.2, libasound.so.2, libatspi.so.0).” Recording and acceptance use the existing Playwright Chromium plus unpacked libraries, without installing host packages.

The small [actual WebM walkthrough](pending-ui-evidence/page-awareness.webm?raw=true) is committed to this private repository and linked from PR #38. Reviewers need repository access. Screenshots supplement it: [grounded read](pending-ui-evidence/page-aware-read.png), [A/B conflict](pending-ui-evidence/page-aware-conflict.png), [verified B preview](pending-ui-evidence/page-aware-preview.png), [mobile](pending-ui-evidence/page-aware-mobile.png).

## Reviewer walkthrough on disposable data

1. Open pending Event B (Nov 27, 10 AM) and ask for Nov 30, which contains sole pending A (2 PM). Expect a sentence/link for A, with Details closed.
2. Ask **“Can you move THIS event to the 26th?”**. Expect the page/discussion question and verified A/B choices. Network: **zero preview and confirm requests** before choice.
3. Choose B. Expect preview `{eventId:B,date:"2026-11-26"}`, preserved 10 AM, and **Editing: B** with B's original arrival. Inspect the signed reference via fixture assertions, not browser logs. Choosing A instead must preview A, clearly labeled. Manual A editing while on B is also deliberate.
4. Type **“yes”** or **“confirm”**: no save. Only the physical Confirm change button may dispatch the existing signed operation; the recorded walkthrough never clicks it.
5. Navigate to Menus, reopen chat and ask a normal schedule question. Schedule reading still works; no Menu editing is offered. Try light/dark, expanded desktop and narrow mobile.
6. Change page, navigate to the same URL, go back, close/reopen, switch identity or change a selection while a response is pending. Old responses must not reopen a proposal or restore targeting focus. An already-attempted operation remains manually recoverable.
7. Repeat with B confirmed/cancelled/deleted, same-looking records, stale revisions and an explicit date target. Refusals/choices must be honest; the dedicated preview remains authoritative for availability, lead time and DST.

## Reproduction commands

```bash
export PATH=/tmp/bts21-node26/node-v26.13.1-linux-x64/bin:$PATH
node .yarn/releases/yarn-4.5.0.cjs workspace medusa test:unit
node .yarn/releases/yarn-4.5.0.cjs workspace medusa typecheck
MEDUSA_DISABLE_TELEMETRY=true node .yarn/releases/yarn-4.5.0.cjs workspace medusa build
node .yarn/releases/yarn-4.5.0.cjs workspace storefront typecheck
node .yarn/releases/yarn-4.5.0.cjs workspace storefront build
# Disposable services only; discover newly assigned ports rather than reusing these run-specific ports.
docker run -d --name bts21-page-pg -e POSTGRES_HOST_AUTH_METHOD=trust -e POSTGRES_DB=booking_test_page -p 127.0.0.1::5432 postgres:16
docker run -d --name bts21-page-redis -p 127.0.0.1::6379 redis:7
# This run assigned PostgreSQL 32795 and Redis 32796.
cd apps/medusa
BOOKING_TEST_DATABASE_URL=postgres://postgres@127.0.0.1:32795/booking_test_page BOOKING_TEST_REDIS_URL=redis://127.0.0.1:32796 AVAILABILITY_TEST_DATABASE_URL=postgres://postgres@127.0.0.1:32795/booking_test_page node ../../.yarn/releases/yarn-4.5.0.cjs test:integration:http --runTestsByPath integration-tests/http/schedule-edit.spec.ts integration-tests/http/chef-workspace.spec.ts integration-tests/http/booking-scheduling.spec.ts integration-tests/http/scheduling-domain.spec.ts integration-tests/http/availability-concurrency.spec.ts
# Schedule wrapper rerun after fixture correction: all 60 HTTP cases + 5 persistent cases passed.
BOOKING_TEST_DATABASE_URL=postgres://postgres@127.0.0.1:32795/booking_test_page BOOKING_TEST_REDIS_URL=redis://127.0.0.1:32796 node ../../.yarn/releases/yarn-4.5.0.cjs test:integration:http --runTestsByPath integration-tests/http/schedule-edit.spec.ts
cd ../..
LD_LIBRARY_PATH=/tmp/bts-browser-libs/root/usr/lib/x86_64-linux-gnu NODE_PATH=/home/openclaw/projects/bts/node_modules node docs/chef-ai/page-awareness-video.cjs
LD_LIBRARY_PATH=/tmp/bts-browser-libs/root/usr/lib/x86_64-linux-gnu NODE_PATH=/home/openclaw/projects/bts/node_modules BTS21_UI_EVIDENCE_DIR=/tmp/bts21-page-legacy-browser-evidence node docs/chef-ai/pending-schedule-ui-acceptance.cjs
git diff --check
docker rm -f bts21-page-pg bts21-page-redis
```

Arbor-ready handoff: P0 now resolves page and conversational targets independently and asks before conflicting previews; P1 presents grounded prose without another model call. The reviewed navigation fix remains intact. PR #38 includes real UI video, isolated security/DB evidence and reviewer steps. Keep the existing stack open and unmerged; no production deployment or enablement is authorized by this work.

## Message bubble follow-up

User messages now appear in blue bubbles aligned right; Sous Chef replies, errors and loading states appear in neutral bubbles aligned left. Rounded corners indicate the sender side, and screen-reader sender labels remain explicit. The active edit/recovery panel stays by the composer. No backend or confirmation behavior changed.

[Updated built-Admin video](pending-ui-evidence/chat-bubbles.webm?raw=true), [desktop dark screenshot](pending-ui-evidence/chat-bubbles-desktop.png) and [mobile light screenshot](pending-ui-evidence/chat-bubbles-mobile.png) show synthetic fixtures with mocked model responses. The earlier video/screenshots remain available above for comparison. The exact tested commit is recorded in PR #38.

Validation for this presentation change (Node 26.13.1 / Yarn 4.5.0):

```bash
node .yarn/releases/yarn-4.5.0.cjs workspace medusa test:unit --runTestsByPath src/lib/__tests__/chef-chat-ui.unit.spec.ts src/lib/__tests__/chef-page-ui.unit.spec.ts src/lib/__tests__/schedule-edit-ui.unit.spec.ts
node .yarn/releases/yarn-4.5.0.cjs workspace medusa typecheck
MEDUSA_DISABLE_TELEMETRY=true node .yarn/releases/yarn-4.5.0.cjs workspace medusa build
LD_LIBRARY_PATH=/tmp/bts-browser-libs/root/usr/lib/x86_64-linux-gnu NODE_PATH=/home/openclaw/projects/bts/node_modules BTS21_UI_EVIDENCE_DIR=/tmp/bts21-bubbles-browser-evidence node docs/chef-ai/pending-schedule-ui-acceptance.cjs
LD_LIBRARY_PATH=/tmp/bts-browser-libs/root/usr/lib/x86_64-linux-gnu NODE_PATH=/home/openclaw/projects/bts/node_modules BTS21_PAGE_EVIDENCE_DIR=/tmp/bts21-bubbles-video-evidence node docs/chef-ai/page-awareness-video.cjs
git diff --check
```

The focused suites passed **53 tests**; Medusa typecheck and production build passed. The browser suite additionally checks bubble alignment and overflow in light/dark desktop and 320/390px mobile layouts. The recording exercises grounded replies, target conflict clarification and manual previews, with **2 previews and zero confirmations/recoveries**. No live model, Google or email was used. The full backend/database and storefront gates above belong to the preceding implementation and were not rerun for this styling-only change.
