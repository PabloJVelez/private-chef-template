# Sous Chef phone page (PR #43)

## Current design

Phones open `/app/sous-chef` (or the configured Admin basename) from the existing
launcher. This is a registered Admin route rendered as a normal-flow `main`, not
an enlarged Radix dialog. The existing authenticated chat host wraps the protected
outlet; on the chat route it replaces the dashboard chrome. Authentication, RBAC
and shared providers remain upstream. This extends the already accepted global
mount integration and must be rechecked on Medusa upgrades.

Desktop and tablet launchers retain the floating dialog. Phone detection covers
narrow viewports and coarse-pointer phone landscape. Once on the chat route,
rotation/resizing does not eject the user or discard their draft. Back returns to
the originating page; direct links/reloads have an Admin-home fallback. Browser
Back/Forward works. Reload retains the existing session-only behavior: it does not
persist conversation or drafts to storage.

One persistent ChefChat instance owns conversation, draft, in-flight response and
schedule editing state. Entering the phone route is only a presentation transition:
the source page hint and response ticket remain valid. Leaving chat ends actionable
targeting and unused confirmations as before; attempted-write recovery remains in
the existing schedule-edit store. No backend/provider/scheduling behavior changed.

## Removed superseded iPhone workarounds

- Fixed-body scroll locking and negative scroll-position restoration.
- Floating mobile panel margins, visual-viewport top translation and scroll listener.
- Below-240px shared-row and below-90px composer-only modes and DOM markers.
- Tests that required hiding conversation and squeezing all controls into 45px.

Kept useful accessibility/UI behavior: 16px phone inputs, 44px touch targets,
no unsolicited touch-keyboard focus, safe-area padding, contained conversation
scrolling, compact welcome cards, readable messages and reduced-motion support.

The page uses dynamic viewport height, with a page-only visualViewport resize
subscription for keyboards that leave CSS viewport units unchanged. Pinch zoom
and transient zero-height values are ignored. There is no position/offset or body
mutation. At exceptionally small heights the page keeps a 180px readable layout
and allows normal document scrolling instead of clipping controls or hiding chat.
This is not a claim that all controls fit simultaneously into 45px.

## Verification

`mobile-chat-acceptance.cjs` serves the built Admin and intercepts APIs with synthetic
data. It checks phone portrait/landscape, tablet and desktop, both themes, actual
route navigation, direct links/reload, Back/Forward, draft/history retention,
rotation, no body lock/dialog on the phone page, and modeled viewport heights
300/220/180/120/60/45px. Tiny-height tests assert no panel clipping and scrollable
controls, not native keyboard behavior. Component tests cover origin event context,
in-flight answers through the route transition and existing scheduling boundaries.

Run from the repository root after both workspace typechecks/builds:

```sh
MOBILE_EVIDENCE_DIR=/tmp/pr43-page-touch node docs/chef-ai/mobile-chat-acceptance.cjs
MOBILE_POINTER=mouse MOBILE_EVIDENCE_DIR=/tmp/pr43-page-mouse node docs/chef-ai/mobile-chat-acceptance.cjs
```

Optional PREVIEW_PLAYWRIGHT_MODULE/PREVIEW_CHROMIUM_PATH select an installed browser.
Earlier screenshots under `mobile-opening-evidence/` are historical window-layout
evidence, **not** screenshots or acceptance of the new page.

## Device acceptance still required

Previous floating-window fixes passed emulation but failed the owner's physical
iPhone. They are superseded, not accepted. Test the new preview on native Safari:
open, focus/type, dismiss/reopen keyboard, Back/reopen, portrait/landscape rotation,
and scroll long answers/confirmations. Chromium viewport simulation does not prove
Safari keyboard animation, panning, accessory bars or safe-area behavior. Keep the
PR open until owner acceptance; production is unchanged.
