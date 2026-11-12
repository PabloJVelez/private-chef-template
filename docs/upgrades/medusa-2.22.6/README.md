# Medusa 2.22.6 / Node 24 upgrade

Implementation branch: `upgrade/medusa-2.22.6-node24`. Base and freshly fetched
`origin/main`: `b5ac172c2d7961dc729fe398a2e495f2d26eb52a`. No main drift was present.
No deployment, merge, production access, Node 26, Meal Prep or booking redesign.
See `verification.md` for the tested revision and results.

## Compatibility decisions

- Retain Node 24.22.1 and Yarn 4.5.0. Pin Medusa 2.22.6 across both workspaces and
  resolutions, dashboard UI 4.2.13, icons 2.22.6 and React 18.3.1. Backend Vite 7
  and SWC/native Alpine compatibility are checked through clean pruned images.
  Storefront Vite 5 and Zod 3 remain independent.
- Backend ORM, DI, PostgreSQL and Zod imports use framework exports. Matching
  Express dependencies on Medusa's consuming packages prevent Yarn from creating
  two utils/DML metadata caches (which otherwise breaks native Product startup).
  Package extensions document these bounded graph repairs.
- Product reviews moves from 1.2.0 to 1.4.0 with a checked-in Yarn patch: server
  ORM/Zod boundaries use framework exports and store selectors explicitly allow
  response fields and image URLs. Admin Zod remains unchanged. `plugins: []`
  remains unchanged: existing seed imports and storefront SDK paths survive, but
  a live enabled-plugin migration is NOT proven. Enabling it requires separate
  fixture evidence. No review data or product feature was removed.
- Product detail/list use default public fields plus calculated prices, inventory,
  categories and metadata; no broad allowlist relaxation. Target already allows
  calculated_price, inventory_quantity, category_children and payment collection
  payments. Explicit order `*items` remains. Shipping compiles against target
  types; balance-loading behavior is exercised by actual native module startup.
- Native Stripe context idempotency keys now reach create/update/capture/refund/
  cancel/delete mutations. No new recovery framework or invented payment keys.
  Promotion 400 errors and non-applied codes produce form errors. SDK line-item
  deletion passes authentication in the target argument position.
- Native acceptance and child ticket workflows explicitly retain completed state
  for 90 days (7,776,000 seconds). This is NOT a reservation TTL. Missing/expired
  history blocks replay of finalized, claimed-without-child and old attempts.
  Replacement recovery still requires the retained original terminal failure.
  Scheduling protection is never released because history expired. Legacy retained
  child checkpoints, product-created/response-lost recovery and compensation remain
  within native orchestration. Deterministic Product validation stops retrying.
- Availability sidebar transform preserves `usePermittedNavItems`, inserts after
  Store and removes only its duplicate extension. **The old settings prefix shim
  is removed**: although 2.22.6 still calls `createRouteMap(filteredSettingsRoutes)`,
  `get-route.map.tsx` now mounts `settingsRoutes.flatMap(r => r?.children || [])`.
  Keeping the old shim double-stripped the prefix and caused a real browser 404.
  Tests execute both installed route construction and the installed mount expression.
- `Migration20261112000100` makes experience `available_time_slots` nullable,
  matching existing DML/API. New ORM inserts null explicitly where old ORM omitted
  the column and used its default. Down migration refuses incompatible null rows;
  coordinated restore is the rollback, not destructive data normalization.

## Release gates

The two requested Arbor assessment/planning URLs could not be read: public access
redirects to sign-in and this session has no Arbor connector. The full assessment
must be reconciled with this implementation before release:

- https://arborthreads.com/threads/thr_eedabf62-98c1-4910-9693-63eeaea2c597#c-con_4a0dc38d27fcb62edf2727f9426901c833460136116d52217226317abc9040de
- https://arborthreads.com/artifacts/art_08185b96-befc-4d36-851b-76cb15269639/medusa-node-upgrade-baseline-compatibility-and-validation

Synthetic PostgreSQL/Redis rehearsal is not a sanitized production rehearsal.
Require representative data volume, migration duration/lock budget, legacy plugin
records, real pending payment/workflow combinations and backup restore timing.
Provider tests use mocked transport/dummy keys; real Stripe webhook duplication,
authorization/capture/refund, Google Calendar reconciliation and email delivery
remain sandbox release gates. Browser outbound requests were blocked. No real
provider calls or customer data were used. Never infer payment completion proof
from a rendered checkout or a passing native booking fixture.

## Single-executor rollout (not executed)

1. Inventory current image/code/lock, database migration ledger, active booking
   attempts, held/confirmed Scheduling interval IDs, product links, money and native
   workflow states. Resolve ambiguous externally dispatched effects before cutover.
2. Enter maintenance; stop ALL old API writers, scheduled jobs, subscribers and
   workers. Drain or explicitly record in-flight payments. Ensure no old process
   can resume work during migration or rollback.
3. Take verified, coordinated PostgreSQL and Redis snapshots after writers stop.
   Record cutoff time and external Stripe intent/refund IDs, calendar event IDs and
   email dispatch IDs. Database-only rollback does not rewind queues or providers.
4. Start exactly ONE migration executor from the new pinned image. Run reviewed
   `medusa db:migrate`/link migration plan; capture full exit status and ledger.
   Rehearsal used `--execute-all-links --execute-safe-search` only on disposable
   databases. Inspect production link plans before executing them.
5. Docker startup currently runs `db:migrate && start`. Override startup for every
   API/worker replica to `medusa start` after the single executor succeeds. Do not
   let parallel replica startup race migrations. Repeat migrations once and compare
   the ledger; then boot one canary with writers still gated.
6. Compare protected interval sets/IDs, attempts, money, product links and retained
   workflow state. Test Admin auth, direct Availability route/save/conflict recovery,
   workspace/calendar, catalog prices, checkout/invalid promotions, explicit order
   items and provider sandbox webhooks. Monitor migration errors, query latency,
   queue backlog, retry/compensation rates and duplicate effects. Only enable writers
   and scale workers after all gates pass. Define error/latency limits with owner.

## Rollback and unavailable-history recovery

- Stop new writers/workers first. Preserve the failed new database/Redis snapshot
  and logs for reconciliation. Do not point old binaries at a migrated database
  or assume down migrations preserve all new schema/data.
- Restore the coordinated pre-upgrade PostgreSQL AND Redis snapshots into isolated
  services, verify the old ledger, then boot the old pinned image with outbound
  dispatch disabled. Compare protected intervals, attempt IDs, product ownership,
  money, links and native history before reopening traffic.
- Reconcile every effect since the snapshot against Stripe intent/refund status,
  calendar event IDs and email dispatch records. Never replay a capture/refund or
  send an email simply because a restored database lacks its acknowledgment.
  Reconcile paid orders with native checkout/payment workflows and original keys;
  webhook duplicate delivery must remain idempotent. Do not manufacture a fresh
  key to bypass an uncertain result.
- When retained acceptance history is missing, freeze that attempt and retain its
  protected time. Inspect event/attempt/product/link state plus external effects.
  A missing checkpoint is not terminal-failure evidence. Use native recovery only
  when original state proves its preconditions; otherwise restore a coherent backup
  or obtain an explicit operator resolution with an audit trail. Never delete the
  reservation or create a replacement attempt as an expiry cleanup shortcut.
- Reopen traffic only after old-version first boot, inventory comparisons and
  external-effect reconciliation pass. If new writes occurred, reconcile them
  separately before rollback; the synthetic restore does not prove that procedure.
