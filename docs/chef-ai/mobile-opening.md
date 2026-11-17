# BTS-22 mobile opening follow-up — owner acceptance pending

This standalone follow-up starts at fetched main `b5266876d2db8088802205ed5e543441a53d3993`, including #39, #40 (merge `08c0cf673f28eaf785b499a5d739201fab6d71a1`) and #41. The existing T3-managed `feat/sous-chef-mobile-opening-v2` checkout was clean at that exact SHA. Open PRs #16–20, #25, #27–30 form an unrelated Meal Prep stack and were untouched.

## Owner evidence and scope

[BTS-22](https://arborthreads.com/threads/thr_be177a01-4b82-4586-9288-926e1e81f73b) remains **active / needs review**. The owner definitively confirmed merged #40 was loaded. This investigation does not attribute the failure to deployment or stale assets.

The two Arbor media URLs returned HTTP 401. The owner subsequently supplied both original images in this implementation thread, and both were inspected. The keyboard-closed image shows an enlarged panel clipped at the right edge, Close outside the image, and composer below the usable area. The keyboard-open image fits horizontally, but header/welcome/cards consume most of the space and cards extend behind the composer boundary. Those are real failures, regardless of the prior emulation pass.

Source/built-Admin findings:

- Opening unconditionally focused the textarea; quick-action sends also focused it. This can summon a touch keyboard. The new behavior focuses Close on touch-capable systems (`any-pointer: coarse`), including reopen; direct typing remains available. Mouse/keyboard-only systems retain textarea autofocus.
- Welcome cards used a device-width breakpoint and verbose hints. Cards now use two shrinkable `minmax(0, 1fr)` columns, with compact padding and hidden redundant hints at phone widths/short heights. Accessible full-question names remain. Header text can shrink while its controls retain their width.
- The built Admin already includes `width=device-width, initial-scale=1`. Radix portals the panel to body, outside transformed Admin ancestors. No viewport meta or global zoom changes were made. The subsequent `e949138` follow-up added a mobile-only fixed-body scroll lock, preserving inline styles and document scroll on close/unmount and desktop-breakpoint exit.
- The exact right-edge failure was **not reproduced in Chromium**. The relative enlargement between the owner's images is consistent with a zoom/viewport difference, but the screenshots do not expose `visualViewport.scale`, offsets, or timing; they do not prove an autozoom cause. Removing unsolicited focus eliminates one plausible trigger. Horizontal containment and wrapping are checked separately.
- The existing visual-viewport height/offset subscription and log-owned scrolling remain. Touch tablets up to 1024px now use the same viewport-bounded layout and 44px controls/16px inputs, so keyboard changes are not limited to phone-width CSS queries. Desktop mouse layout is preserved.

No edits to schedule state/transport, prompts/providers, domain workflows/modules, availability or write flags. Pending-only targeting, exact IDs, read-only previews, signed physical Confirm, unused-Confirm invalidation, attempted 202/409 recovery, #39 pacing and reduced-motion dots retain their existing behavior.

## Reproduction and evidence

All browser requests are intercepted synthetic fixtures against this checkout's **built Medusa Admin**. No backend server/database, paid model or live writes are involved.

```sh
export LD_LIBRARY_PATH=/tmp/bts-browser-libs/root/usr/lib/x86_64-linux-gnu
export NODE_PATH=/home/openclaw/projects/bts/node_modules
export PATH=/tmp/private-chef-node26-tools/node-v26.13.1-linux-x64/bin:$PATH
# From apps/medusa:
node node_modules/@medusajs/cli/cli.js build
node node_modules/typescript/bin/tsc --noEmit
TEST_TYPE=unit NODE_OPTIONS=--experimental-vm-modules node node_modules/jest/bin/jest.js --runInBand --forceExit --silent --testPathPattern='chef-chat-ui|chat-scroll|schedule-edit|admin-chef-chat'
# From the repository root:
MOBILE_EVIDENCE_DIR=/tmp/bts22-v2-after node docs/chef-ai/mobile-chat-acceptance.cjs
MOBILE_POINTER=mouse MOBILE_EVIDENCE_DIR=/tmp/bts22-v2-mouse node docs/chef-ai/mobile-chat-acceptance.cjs
BTS21_UI_EVIDENCE_DIR=/tmp/bts22-v2-schedule node docs/chef-ai/pending-schedule-ui-acceptance.cjs
```

T3 preview opening failed twice because host browser libraries were missing. The known unpacked-library fallback above was reused; no host library installation. Existing dependencies were symlinked only into this checkout after confirming the lockfile matches the dependency source.

The harness now uses touch/mobile Chromium contexts and reads the real browser visual viewport before injecting keyboard dimensions. The prior harness used a desktop context and replaced the viewport from document-start `innerHeight`; in a mobile context that can capture the pre-meta 980px layout and produce false measurements. The new shim delegates to the native viewport until an explicit simulation, then restores it on dismissal. Neither shim is a native keyboard test.

Opening screenshots/metrics are captured before sending any question. Further checks cover 320/360/375/390/430 portrait, 667×320 landscape, 768/1024 tablets, light/dark, mouse desktop, reopen, rotation, layout-viewport resize (Android-like model), visual-only resize/pan (iOS-like model), long event titles, scroll containment and unused-Confirm revocation. Schedule browser regression separately exercises physical confirmation and attempted-write recovery. IME, focus lifecycle and pacing are covered by component regressions.

## Validation result

Medusa build and typecheck passed. All 152 focused tests passed (five suites). Built-Admin validation passed 16 touch viewport/theme cases and four mouse cases, including desktop autofocus; no browser errors or unexpected API routes. The schedule regression passed with 31 synthetic previews, five physical Confirm requests and two recovery requests. Typing/reduced-motion browser checks passed.

[Before measurements](mobile-opening-evidence/before/result.json) and [after measurements](mobile-opening-evidence/after/result.json) include opening focus, panel/control rectangles, visual viewport and log scroll width. [Mouse results](mobile-opening-evidence/after/mouse-result.json) cover desktop focus/layout. Baseline results were recorded from the original base build before implementation, across 18 cases; the final harness additionally asserts the empty keyboard state, rotation, layout resize and reopen. The baseline is not a claim to have reproduced the owner's Safari overflow.

Screenshots (Chromium, synthetic Admin data):

- 320px light: [before](mobile-opening-evidence/before/opening-320-light.png), [after](mobile-opening-evidence/after/opening-320-light.png).
- 390px dark: [before](mobile-opening-evidence/before/opening-390-dark.png), [after](mobile-opening-evidence/after/opening-390-dark.png).
- Short landscape: [before](mobile-opening-evidence/before/opening-667-dark.png), [after](mobile-opening-evidence/after/opening-667-dark.png).
- [Empty welcome with labeled visual-only keyboard simulation](mobile-opening-evidence/after/opening-keyboard-model-390-dark.png).

## Required owner acceptance

Bumblesous: please review the focused layout/focus change and test on the owner's iPhone 14 Pro Safari **before calling BTS-22 resolved**. Also obtain native Android acceptance. Open from the launcher with keyboard closed: verify no keyboard summons, full panel width, readable welcome and accessible Close/Send. Tap the composer, type, dismiss/reopen the keyboard, close/reopen chat, rotate, and scroll a long conversation plus confirmation/recovery panel without moving Admin behind it. Try light/dark and normal text sizing, then any text/zoom preference used in the failing screenshots.

Native Safari keyboard animation/panning, predictive/accessory bars, retained zoom, safe-area changes, text autosizing, native date/time pickers and touch momentum remain unverified. The viewport handler intentionally ignores `scale !== 1` to preserve user pinch zoom; this change does not force-reset an already zoomed page. Delayed or transient Safari viewport events remain a real acceptance risk. Chromium mobile emulation and both keyboard models do not establish native Safari or Android correctness.

Keep the PR open/unmerged. No deployment or production flag/data changes are authorized by this validation. The owner-device failure remains an acceptance blocker, not a hypothetical non-blocking caveat.


## Landscape keyboard follow-up (2026-11-17)

The owner supplied a new physical-iPhone failure: landscape is readable before focus,
but opening the keyboard collapses/clips the chat. This supersedes the earlier
partial “looks better” feedback; native-device acceptance is still blocked.

The previous browser model clamped the empty-chat visible height to at least 230px.
It therefore missed landscape browser chrome plus keyboard/accessory bars leaving
much less space, especially with a multiline draft. The extended regression failed
against the prior built Admin because controls fell outside the visual viewport.
This reproduces a short-height layout defect, not Safari's exact event sequence.

Below 240px of visual viewport height, the mobile panel now uses a shared composer/
Close row and a separately scrollable conversation above it. The decorative header
is visually clipped while its accessible title/description remain. The draft is
retained and scrolls within a 44px textarea instead of consuming the remaining
height. Normal layout returns when the keyboard closes. Zero-height transient
viewport events are ignored, and pinch zoom retains the existing behavior.

Regression coverage includes 667px and 844px landscape widths, 180/120/90px visual
heights, nonzero visual offsets, multiline drafts, both themes, 44px control bounds,
non-overlap and a positive conversation scroll region. These are injected Chromium
visual-viewport models, **not physical Safari or Android acceptance**. Re-test the
owner's exact landscape focus/type/dismiss/rotate sequence on the updated preview
before resolving the issue. Production and scheduling behavior remain unchanged.

Validation for this follow-up: both workspace typechecks and production builds
passed; all 154 focused chat/schedule tests passed. The built-Admin touch harness
passed 18 viewport/theme cases plus 12 short-landscape checks, with no page errors
or unmocked API routes. Local evidence: `/tmp/pr43-landscape-after/result.json`;
prior-build regression failure: `/tmp/pr43-landscape-before.log`. These checks
cover the application changes in the commit carrying this section, not a new
physical-device result.

## Extreme-height composer-only follow-up (2026-11-17)

The owner's subsequent screen recording rejected the previous landscape fix.
Local Admin-source testing reproduced a second clipping defect: at 60px visible
height, the panel's outer spacing left only 44px for a fixed 53px control row;
at 45px it left only 29px. The overflow-hidden panel clipped all three controls.
This establishes a layout failure, not the exact native Safari viewport sequence.

Below 90px visible height, mobile chat now prioritizes composition: the existing
conversation is hidden (not cleared or unmounted), vertical decorative spacing is
removed, and the input/Send/Close share a centered 44px row. Horizontal safe-area
protection remains. The accessible dialog title and draft are retained, and the
normal conversation layout returns when space increases. At less than 44px usable
height, full-size touch controls cannot fit; no claim of support below that limit
is made. Pinch zoom and transient zero-height handling are unchanged.

The browser regression now includes 70/60/45px in both landscape widths and themes,
checks controls against the panel's clipping bounds as well as viewport bounds,
checks retained multiline drafts, and trial-clicks Send and Close. At extreme
heights it requires the conversation to be hidden rather than a positive sliver.
Component coverage checks mode entry, restoration, transient-zero handling and
cleanup. Native iPhone acceptance remains pending; PR stays open and unmerged.

Verification: both workspace typechecks/builds and all 154 focused tests passed.
The built-Admin harness passed 42 touch cases (18 viewport/theme cases and 24
short-height cases) plus four mouse cases, without page errors or unknown APIs.
Local artifacts: `/tmp/pr43-composer-touch/result.json` and
`/tmp/pr43-composer-mouse/result.json`. This remains simulated keyboard evidence.
