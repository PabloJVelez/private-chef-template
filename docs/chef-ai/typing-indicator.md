# Short-reply pacing and typing indicator

Greeting/help responses now include a presentation-only `replyKind`. The Admin waits only
for the remainder of an 800 ms minimum since request dispatch before revealing these replies.
Slower replies have no additional wait. Other answers and errors retain their existing timing;
there is no backend sleep, extra model call or change to write execution/confirmation.

The pending assistant bubble shows three staggered dots, labeled “Sous Chef is typing” for
assistive technology. Reduced-motion preference disables animation. Send remains disabled
while pending, with its label unchanged. Unmount aborts the delay; existing generation and
navigation checks run after it so delayed responses cannot bypass invalidation.

## Verification

- 63 focused rendered UI/intent/page/assistant-read tests passed, including instant greetings
  and help, slow replies, timer cancellation and existing targeting safeguards.
- Both workspace typechecks and production builds passed (Node 26.13.1, Yarn 4.5.0).
- `typing-indicator-acceptance.cjs` served the production Admin with synthetic intercepted APIs:
  desktop dark typing dots, mobile light reduced motion, no overflow, no page errors or
  unexpected network routes. Three synthetic requests, no model calls or saves.
- Browser-observed click-to-answer times: 978 ms and 943 ms, including browser automation
  and rendering overhead; unit timers verify the exact 800 ms minimum.
- [Dark desktop](typing-evidence/greeting-typing-dark.png)
- [Light mobile, reduced motion](typing-evidence/typing-mobile-light-reduced-motion.png)

Run from repo root after building Medusa:
`node docs/chef-ai/typing-indicator-acceptance.cjs`.
Optional environment overrides: PLAYWRIGHT_MODULE, CHROMIUM_PATH, SOUS_TYPING_EVIDENCE_DIR.
Browser proof used installed Playwright Core and Chromium headless shell build 1208 with
existing unpacked Linux dependencies. This is fixture UI proof, not live auth/model acceptance.
