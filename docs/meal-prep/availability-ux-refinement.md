# Availability UX refinement — stacked on PR #28

Authority: **[Requirements Contract v1.1 / revision 4](requirements-v1.1-r4.md)** and the owner's [BTS-3 focused Availability feedback](https://arborthreads.com/threads/thr_263c8f9a-75d7-40aa-92b2-f9b717546180#c-con_91d18ec662e7dd188c2222c9a485b8a938445c367c6a984582a8f1edd661300a). The full workspace contract, applicable Availability/UI documentation, and shared/global versus method-specific scheduling architecture were read before editing. Applicable requirements and unresolved policies were stated before edits.

## Verified base and scope

- Repository: `PabloJVelez/private-chef-template`, origin `git@github.com:PabloJVelez/private-chef-template.git`.
- Clean, isolated T3-bound worktree: `/home/openclaw/.t3/worktrees/private-chef-template/fix-meal-prep-availability-settings-ux`.
- New head branch: `fix/meal-prep-availability-settings-ux`.
- Parent: open [PR #28](https://github.com/PabloJVelez/private-chef-template/pull/28), branch `feat/meal-prep-v1-fulfillment-validation`.
- Exact base: **`3a5f809cca11cb37c7f782f6055f27ccaf38a339`**. Starting HEAD, merge-base, local parent, live remote parent and GitHub PR head matched before edits. T3 confirmed the worktree binding. The parent was checked again before publication.
- The PR body and handoff record the resulting head SHA; a document cannot embed its own commit hash.

This changes only the existing `/app/settings/availability` editor, tests, documentation and the verification workflow's additional stacked-base filter. No upstream branch or PR is edited. No migration, dependency, API, payment, event-booking, reservation or feature-control implementation changes. No merge, deployment, production activation, real provider call or Arbor publication. D01–D12 remain unresolved; no default hours, meal-prep notice applicability, closure precedence, capacity cap, delivery eligibility or new product policy is introduced.

## UI walkthrough

**Before:** one page showed the usual week, exceptions, advance notice, a single large Meal Prep container and Google Calendar. Meal Prep used seven checkbox-driven weekday rows inside expandable method details, unlike the compact working-week editor. Experience-specific and shared settings were interleaved.

**After:**

1. Open **Settings → Availability**, at the same URL. The save bar states that shared settings and both tabs save together.
2. **Shared availability** identifies timezone, usual week and global time off. Existing usual-week, exceptions and Google Calendar cards remain available independently of the selected experience. Their saved values and scheduling behavior are unchanged.
3. **Private events** contains the existing advance-notice card. Its scope explicitly excludes Meal Prep drafts; the underlying rules and initial imported policies are unchanged.
4. Switch to **Meal Prep** using pointer, keyboard arrows, Home or End. Medusa UI's native Radix tabs provide linked tab/panel semantics. Inactive panels are hidden, and their draft state remains mounted.
5. Review separate cards for supported selection styles, in-home cooking, delivery, pickup, delivery-area drafts, chef work planning and reserved-work review. Draft-only and manual-capacity explanations remain visible.
6. Each method now uses the existing compact **Day / Start / End** editor: **Add working day** selects one or more days, hours begin blank, and **Apply working days** stages them. The day menu supports **Copy to other days**, **Add another time range** and **Remove day**. Replacing configured days still requires confirmation. Dated windows retain the existing shared `HoursEditor` and explicit no-closure-precedence language.
7. Switch tabs while editing: applied settings and unfinished add/copy input stay intact. An unfinished method editor blocks Save on both tabs, warns before leaving, and exposes **Review Meal Prep edits**, which returns focus to the Meal Prep tab. Apply or cancel before saving. Invalid hidden-tab settings also block submission.
8. **Save availability** submits one complete versioned snapshot. **Discard** restores the last saved snapshot across all experiences and resets unfinished editors. Saving while continuing to edit, background refetches, failed saves, stale-version conflicts and exclusive reload retain their previous protections.

### Screenshots

Captured at 1280px and 390px using the actual React components and compiled Medusa admin CSS, with isolated sample settings and in-memory saves. The before bundle loads the relevant source files from exact parent `3a5f809`; the after bundle loads this refinement. These are component-fixture screenshots, **not an authenticated application or live-provider acceptance session**. The final subsequent code change only restores focus for the Review Meal Prep edits action; the pictured layouts are unchanged.

| View | Before | After |
| --- | --- | --- |
| Shared settings | [Before shared settings](availability-ux/before-shared-desktop.png) | [After shared settings](availability-ux/after-shared-desktop.png) |
| Meal Prep | [Before method controls](availability-ux/before-meal-prep-desktop.png) | [After tabs and cards](availability-ux/after-meal-prep-desktop.png) |
| Narrow delivery card | — | [390px shared hours pattern](availability-ux/after-delivery-mobile.png) |

The T3 preview was attempted first and returned: `This host blocks the sandbox T3's browser runs in (AppArmor on Ubuntu 23.10+).` Visual checks therefore used the available local Selenium Chrome service. Native browser interaction confirmed arrow-key tab switching, saving a Meal Prep edit from Private events, menu Escape and focus restoration. The 390px layout had no horizontal overflow. No application database, provider login or customer data was used by the browser fixture.

## Requirement → implementation → test mapping

Paths below are relative to `apps/medusa`.

| Requirement | Implementation | Evidence |
| --- | --- | --- |
| Owner 1: reuse hours editing | Extract existing `WorkingDays` behavior into `WeeklyHours`; keep `WorkingDays` as its global-settings adapter. Methods share add/copy/split/remove/validation; dated windows still use `HoursEditor`. | `availability-ui.unit.spec.ts`: all three method editors, independent scopes, copy replacement, split removal, deletion, invalid times; existing `availability-editor.unit.spec.ts` and global-hours interactions. |
| Owner 2: accessible experience tabs | Existing Medusa `Tabs`; controlled selection, linked panels, mounted drafts with inactive panels hidden. No second route. | Rendered ArrowLeft/Right, Home/End, focus, ARIA linkage/selection/hidden-panel assertions; existing routing tests; native Chrome keyboard check. |
| Owner 3: manageable sections and clear scope | Shared cards outside tabs; event notice card; distinct Meal Prep cards and named method regions. Explicit global, private-event and draft-only copy. | Rendered scoped method interactions; desktop/mobile screenshots and walkthrough above. |
| R09 / T06–T07: global time off, single Availability authority, complete snapshots | Same RHF form, cleaner, version and API. Method patches preserve other fields. Every unfinished editor participates in Save/discard/unload/Google locks. | Six new rendered regressions cover combined saves from either tab/remount, open editors across tabs/discard, copy scope, in-flight edits/stale save, keyboard tabs and invalid hidden-panel hours. Existing reload/refetch/Google/timezone/exception/notice regressions remain. |
| R09 / R19 / T07 / T12–T13: persistence and booking compatibility | No server scheduling changes. Full clean snapshots continue through SDK/HTTP/workflow/PostgreSQL. | Extended `availability-save.spec.ts`: method save retains timezone/Google/time off/notice; event save retains method windows; deletion persists; stale snapshot gets 409. Existing shared-scheduling, Availability concurrency, setup migration, private-event commerce and storefront suites. |
| R02–R03 / R07–R08 / R20 / T02–T04 / T14: preserve drafts and policy gates | Existing independent enablement/styles, area drafts, dated windows and work plans unchanged; manual capacity and no implicit reservations. | Existing meal-prep setup/contracts/real PostgreSQL foundation suites. No product-policy deviation or activation. |

## Local execution — 2026-10-31

Node **24.22.1**, checked-in Yarn **4.5.0**, immutable installation. PostgreSQL **16** in a new disposable loopback-only `availability-ux-test` container, separate from existing development services.

- **497 unique tests passed, none skipped**: 286 Medusa unit/rendered (24 suites), 15 storefront (2), 192 real PostgreSQL integration (5), 4 legacy migration tests (1).
- The first complete PostgreSQL run passed 191 tests; the new save test correctly received HTTP 400 because its fixture copied response metadata (`id`/timestamps) into a strict request. The fixture now uses the same `cleanSettings` function as the actual page. Its complete SDK/HTTP/workflow save case passed on targeted rerun. No runtime/API relaxation was made. Original and retry reports are retained separately.
- Both workspace typechecks and backend/admin/storefront production builds passed. Medusa unit tests/typecheck/build were repeated after the final focus-restoration adjustment.
- The inherited PR8 migration harness passed fresh install, populated-parent upgrade, empty fulfillment-state rollback and reapply; fixture row hashes stayed unchanged. Its explicit schema baseline remains PR8 parent **`f4557fab9d75b515611645be44bbabeb0bda1b10`**. This is inherited migration regression coverage, not a claim of a new UX migration.
- Changed runtime-file ESLint and `git diff --check` passed.
- Expected existing tooling warnings: dependency peers, Jest VM modules/force exit, storefront React `act` warnings, and Unlock's unmatched `menu.config` notice. They did not fail verification.

Repeat with the explicit disposable test URLs and commands in [the verification harness guide](../../scripts/verify-meal-prep/README.md). `checks.sh tests` rejects skipped tests. The workflow now also accepts the exact PR #28 base branch, so opening this new stacked PR automatically runs the comprehensive suite, both typechecks/builds and migration rehearsal against its exact head SHA. Hosted CI and automatic OpenClaw review outcomes belong in the PR handoff; neither is inferred from local checks. No manual review/workflow dispatch is used.

## ChatGPT → Arbor BTS-3 handoff

Publish to the [owner feedback thread](https://arborthreads.com/threads/thr_263c8f9a-75d7-40aa-92b2-f9b717546180#c-con_91d18ec662e7dd188c2222c9a485b8a938445c367c6a984582a8f1edd661300a):

- New stacked PR URL and exact head SHA from its handoff, base branch and **`3a5f809cca11cb37c7f782f6055f27ccaf38a339`**, with PR #28 untouched.
- All three owner UX requests addressed: existing shared weekly editor, Medusa experience tabs, distinct cards with explicit shared/draft scope.
- Screenshots, walkthrough, requirement/test mapping, local 497-test evidence, hosted CI run/artifact links and actual OpenClaw review disposition.
- No new schema or product policy; no production activation, payment change, merge or deployment. Inherited D01–D12 and full V1 release gates remain as recorded in Contract v1.1/r4 and the PR8 owner guide.
- Owner review should exercise native date/time pickers, shared controls, both tabs, Save/Discard and conflict reload in their authenticated local admin. Fixture screenshots and tests do not claim real Google/Stripe or complete private-event checkout E2E.

ChatGPT publishes this handoff to Arbor. This agent only prepares it and opens/registers the PR.
