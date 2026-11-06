# Meal Prep storefront discovery — PR 1

Authority: **Meal Prep Requirements Contract v1.2, artifact revision 5**, and **discovery acceptance matrix revision 3**, supplied in full in the implementation prompt on 2026-11-06. BTS-12 objective: the first read-only, settings-driven storefront discovery slice. The repository's v1.1/r4 documents describe earlier work, not this PR's authority.

Canonical sources: [contract artifact](https://arborthreads.com/artifacts/art_8214c614-a9b1-482d-8d8d-498499f1fe0a), [BTS-12](https://arborthreads.com/threads/thr_f47b1343-a620-4a7b-8ea2-6852e895eaae), [BTS-2 Save correction](https://arborthreads.com/threads/thr_d3aaf82d-68a9-4a5f-b231-4aec14bc840a#c-con_a80ba6f30372fde40e19091dffa31d1826e51bd45a02aade6049f1054ab89c92).

## Baseline and pre-edit decisions

Verified before edits: clean isolated `feat/meal-prep-storefront-discovery` worktree; origin `git@github.com:PabloJVelez/private-chef-template.git`; local HEAD and open PR #29 head exactly `53702ef0fee6b82ba79687a8bd3eb9867c1cd0ea`. PR #29 targets PR #28's `feat/meal-prep-v1-fulfillment-validation`, head `3a5f809cca11cb37c7f782f6055f27ccaf38a339`, an ancestor. Remote main was `fe64336c226d121ef3060a309cf6e570bd2de6dd`; merge base `9ab70faed0e2b50246262833c370d5d21dd33742`; 18 stack-only / 5 main-only commits. No merge or rebase performed. This PR targets `fix/meal-prep-availability-settings-ux`.

Before editing, the implementation session enumerated requirements, unresolved policies, fixtures, tests, and the schema below. Matrix r3's concrete fixtures resolve its earlier generic missing-content wording: enabled valid methods have a safe generic informational path without offers, delivery area or pickup location. Missing those details must not fabricate offers or imply request readiness.

Applicable requirements: immediate-on-Save; derived method/style discovery; allowlisted public reads; disabled customer requests; separate not-offered/unavailable/outage states; no cross-method suppression; fresh SSR/navigation/focus; bounded isolated refresh; committed Admin guidance; preserved optimistic concurrency and unsaved edits; no lifecycle/migration; private-event regressions.

Open and untouched: delivery eligibility/ZIP-radius combination, pickup locations/windows, fees, pricing/grocery/payment terms, identity, recurrence horizons/conflicts, T-24h anchor, cancellation/refunds/unpaid fulfillment, external-calendar assurance, and material changes to pending requests. Spending caps remain excluded. None blocks generic informational discovery. No product-policy deviation.

## Frozen public schema and content

`GET /store/meal-prep` returns HTTP 200 and `Cache-Control: no-store`:

```json
{
  "status": "available",
  "can_request": false,
  "methods": ["in_home", "delivery", "pickup"],
  "selection_styles": ["individual_dishes", "package", "chosen_menu", "tailored_plan"]
}
```

Only these four fields leave the backend. Methods/styles use stable allowlisted ordering. `available` means at least one valid enabled informational method. `not_offered` means absent/null setup or all valid methods disabled. `unavailable` means malformed configuration leaves no safe method. No valid methods means an empty style list. Per-method schema validation does not depend on another method, private area/work-plan data, offers, or the frozen execution flags. Enabled known style booleans are independently allowlisted. No dates, prices, area eligibility, offers, version, internal blockers, addresses, household/access details, or provider metadata are public.

Operational errors return HTTP **503**, no-store, and `{ "message": "Meal Prep information is temporarily unavailable. Please try again.", "retryable": true }`. No write initializes absent settings. The storefront resource independently validates and reconstructs the public shape; malformed upstream data is a failure, never absence.

Content audit: existing event menus and `MenuListItem` encode event price/duration semantics. Discovery does not consume them or `/store/availability`. Its only content is generic application copy keyed by known method/style identifiers. No dated offer is claimed or fabricated.

## Freshness and Admin behavior

A single database row read observes one committed Availability snapshot. Save already replaces the snapshot atomically and uses the expected version; this PR preserves that workflow.

Initial SSR reads status with a 3-second upstream timeout. A request-scoped WeakMap shares a promise where the router supplies the same Request object; it never caches across requests. The landing loader's result supplies both the page and header on SSR/navigation. Separate requests across a Save may legitimately differ. Meal Prep links do not viewport-prefetch the loader. The existing root `shouldRevalidate` behavior is unchanged.

Focus return fetches only `/api/meal-prep`, with a 5-second browser deadline. Navigation into `/meal-prep` executes its loader. Sequence guards and aborts prevent older focus responses from overwriting newer reads or navigation. Leaving the landing page does not restore the older root snapshot. No idle polling or live-push promise. Browser tests wait for focus-listener registration before injecting focus; the outage scenario deliberately holds the client script to verify that SSR content alone is not mistaken for completed hydration. Cold failure omits navigation; warm failure may retain its last successful visibility. Page content always shows the current failure, with retry. Confirmed off/unavailable removes navigation. Root cart/customer/regions/products are not refreshed by focus.

Admin uses the existing Medusa UI components. The service Draft badge and “not live yet” copy are removed. Guidance reads committed query data; unsaved controls are explicitly labelled and cannot advertise their own changes as committed. Valid incomplete configurations save. On an ambiguous Save error, Admin re-reads: matching content at the expected next version confirms the committed result while preserving later edits. Other results keep the original draft/version and ask the editor to reload/review. A failed verification says the outcome is unknown. A 409 never attaches another editor's revision to the stale draft. Explicit reload discards only after a successful read.

## Requirement-to-test mapping

Paths abbreviated below are under the corresponding workspace. Browser tests run the actual built React Router storefront and Medusa Admin against a dedicated PostgreSQL database; no production provider calls.

| ID | Evidence |
|---|---|
| SD-01 | Medusa `integration-tests/http/meal-prep-discovery.spec.ts`: HTTP versioned Save → fresh Store read for each method; storefront rendered navigation/focus test; browser SSR/navigation/focus scenario. |
| SD-02 | PostgreSQL HTTP stale race/400 rejection and committed-but-lost response; rendered `availability-ui.unit.spec.ts` preserves later edits and unknown outcome; real Admin browser drops POST response after commit, then tests 409/reload. |
| SD-03 | PostgreSQL competing same-version writes plus 104 concurrent reads over alternating complete snapshots; each projection belongs to a permitted committed version, never mixed. Private area fields remain absent. |
| SD-04 | Missing-row read leaves DB empty; null/missing/off evaluator fixtures; SSR/rendered/browser off state and absent nav. |
| SD-05 | Each enabled method without offers/area/location is informational; malformed-only setup unavailable; `can_request=false` in all projections. Backend units, rendered UI and browser. |
| SD-06 | Malformed delivery plus valid in-home remains available, delivery omitted. Evaluator unit and browser mixed-method screenshot. |
| SD-07 | Known enabled styles only; no prices/duration/fulfillment promises. Evaluator allowlist, rendered content assertions, actual browser screenshots. |
| SD-08 | Exact public keys with sensitive origin/work plans/household/access/provider/internal/unpublished data fixtures; proxy strips/rejects unexpected shape; browser verifies private markers absent from SSR HTML. |
| SD-09 | Route unit safe 503; loader/proxy 503 tests; real database table-unavailable browser scenario, landing 503, recovery by Retry. |
| SD-10 | Root loader outage test preserves cart/customer/product results; cold/warm rendered navigation; real root/menus HTTP 200 during Meal Prep database read failure. |
| SD-11 | Request-scoped loader dedupe test; real server HTML contains method descriptions before hydration; nav/page share landing projection; no hydration page errors. |
| SD-12 | Rendered overlapping focus and navigation race tests, retained refreshed nav when leaving; browser focus resource request count excludes unrelated cart/customer/products; re-entry sees new Save. |
| SD-13 | Actual Medusa UI rendered tests cover committed vs unsaved guidance, Save/Discard/409/in-flight edits; real Admin browser and screenshot verify badge removal and lost-response recovery. |
| SD-14 | Dedicated filesystem route, generic page, desktop/mobile conditional navigation, no page form/input/select/booking action. Actual browser and rendered tests. |
| SD-15 | Full existing backend/storefront regression suites: availability, shared scheduling, event tickets, event acceptance, additional charges, Stripe checkout and private-event acceptance emails, request calendar/menu flow, and legacy migration. Browser preserves menus/root during outage. |
| SD-16 | Route export test permits GET only, actual Store POST has no handler, feature-controls all false. Existing Stripe/email adapters use test doubles; no changed execution adapter or public write route. |
| SD-17 | Save/read for each method without offers/area/location; informational-only copy and no fabricated offerings. Admin valid-incomplete Save rendered test; backend and browser fixtures. |

## Verification and reproduction

The PR body records the final exact head and CI run. CI checks out the PR head SHA, not a synthetic merge. Local evidence is in ignored `artifacts/meal-prep-verification/`, including JSON reports, logs, screenshots and failure traces when applicable.

- Backend unit/rendered regression suite: **304 passed**.
- Storefront unit/rendered/loader regression suite: **26 passed**.
- Existing PostgreSQL suite: **192 passed**; new real module/HTTP/concurrency suite: **1 passed**.
- Legacy migration suite: **4 passed**. No skipped/todo tests.
- Chromium browser suite: **4 passed**, using real built applications and PostgreSQL.
- Both workspace typechecks and production builds pass.
- Existing migration upgrade/preservation/rollback rehearsal passes locally and is retained in CI. The archived parent is installed immutably when dependency manifests differ. This slice introduces **no migration** and no publication table.

Run `scripts/verify-meal-prep/checks.sh tests` with all three explicit disposable PostgreSQL test URLs, then `checks.sh builds` with the verification-only provider environment described in `scripts/verify-meal-prep/README.md`. The new module suite runs separately because Medusa 2.7's cached MikroORM metadata cannot safely cross a second Jest VM context for the same entity.

For browser verification, install Chromium with `node node_modules/@playwright/test/cli.js install --with-deps chromium`, then run `DISCOVERY_BROWSER_DATABASE_URL=postgres://test:test@127.0.0.1:5432/discovery_browser bash scripts/verify-meal-prep/browser.sh` after building. The script requires a local disposable database name, refuses an existing fixture database, starts both applications, and stops its processes on exit. Fixed fixture credentials are local test data only. CI uploads all reports under the exact head SHA.

Local T3 preview failed twice because host Chromium libraries are absent and sudo is unavailable. Browser verification therefore uses `mcr.microsoft.com/playwright:v1.56.1-noble` (Chromium, host networking, workspace bind mount, `DISCOVERY_BROWSER_DOCKER=1`); the same committed Playwright tests run natively in CI. This is a tooling deviation, not a product deviation.

## Screenshots

- [Storefront desktop](storefront-discovery/storefront-desktop.png)
- [Storefront mobile](storefront-discovery/storefront-mobile.png)
- [Independent mixed-method readiness](storefront-discovery/storefront-mixed.png)
- [Retryable outage](storefront-discovery/storefront-outage.png)
- [Committed Admin guidance](storefront-discovery/admin-committed.png)

## Arbor BTS-12 handoff

Implemented the first read-only discovery slice against contract v1.2/r5 and matrix r3, stacked directly on PR #29's verified head. Successful Availability Save controls the next fresh Store read; discovery exposes only allowlisted known method/style identifiers and always disables customer requests. Generic method information works without offers, delivery area or pickup location. Admin distinguishes saved guidance from unsaved edits and rechecks ambiguous saves. SSR/navigation/focus freshness, independent method eligibility, privacy and outage containment are covered by real PostgreSQL, rendered and browser evidence mapped above.

Owner review should assess the informational copy, conditional navigation, Admin guidance and the attached screenshots. No pricing, delivery eligibility, recurrence, identity, payment timing or pending-request policy was decided. No migration, publication lifecycle, customer writes or frozen execution activation. No merge or deployment performed. OpenClaw's normal PR review queue is left to run naturally. Final PR link, exact head and CI status are supplied in the PR handoff; no Arbor message was automatically posted.
