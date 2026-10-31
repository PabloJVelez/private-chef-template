# Meal Prep V1 — Stacked PR Delivery Plan
Status: Active delivery strategy. Product behavior remains governed by canonical Requirements Contract v1.1 and the reconciled architecture; this document changes Git workflow, not scope.

## Owner decision
Keep PR #16 (foundations) unmerged. Build the next PR on its feature branch, and each later PR on the immediately preceding branch. No PR is merged or deployed during feature construction. After the final stack tip is ready, the product owner checks out that final branch locally and runs manual integrated testing against disposable development resources.

## Stack and review boundaries
- PR 1: [#16 foundations](https://github.com/PabloJVelez/private-chef-template/pull/16), base `main`, commit `d301128119e3c7667a48b48ca3a4f4070e14152a`. Review complete; not merged.
- PR 2: shared occupied-time protection. Base = PR 1 head branch. Separate isolated T3 worktree; no new checkout from `main`.
- PR 3: Availability extension and chef service setup. Base = PR 2 head.
- PR 4: dated offers, intake and customer authorization. Base = PR 3 head.
- PR 5: arrangements, four-pattern recurrence and approvals. Base = PR 4 head.
- PR 6: approved-price billing and manual payment links. Base = PR 5 head.
- PR 7: opt-in autopay and timed reminders. Base = PR 6 head.
- PR 8: fulfillment, integration and release validation. Base = PR 7 head.

Each PR targets the immediate predecessor branch so the review diff contains only that layer. Record the exact base branch, head branch, base/head SHA, PR URL and relevant Arbor thread in every handoff. Prefer one isolated T3 worktree per PR. Rebase/restack downstream branches when upstream layers change, then rerun affected tests. Never merge a middle PR out of order. No automatic merge or deployment.

## PR 1 review record and carry-forward gates
The independent OpenClaw review of PR #16 found no merge-blocking defects (8/10 confidence) and passed 23 focused tests. Outstanding caveats: hosted CI not reported, review runtime Node 24.16.0 below declared ^24.22.1, and no production-scale migration rehearsal. Carry these as explicit validation gates through the stack; do not interpret the review as permission to activate the feature.

## PR 2 technical constraints
Extend shared PostgreSQL-backed protection of actual chef occupied time while preserving existing private-event exclusion constraints and Availability behavior. No automatic delivery/pickup order or serving caps, no pickup-as-exclusive-appointment, and no policy defaults for unresolved scheduling questions. Test cross-domain concurrent acceptance, existing event regression, migrations/backfill and rollback. Keep new feature disabled.

## Final local manual testing gate
1. Freeze the stack tip and document exact SHA and migration order.
2. Provide one repeatable checkout/setup procedure for the final branch, compatible Node/toolchain versions, dependencies, environment variable templates and disposable database.
3. Rehearse migrations against both clean and representative upgrade fixtures; back up any local database before destructive testing.
4. Run the full automated suite and report real PostgreSQL, UI, payment test-mode and regression results.
5. Owner checks out the final PR head locally, runs the services, exercises all three fulfillment methods and four recurrence patterns, approval/change/payment failure flows and existing private events.
6. Record issues in Arbor/GitHub; fix via new top-of-stack PRs or targeted amendments with downstream restacking. No merge/deploy until owner explicitly approves after manual testing.

## Session operating protocol
Future T3 launches use Full Access, a T3-bound isolated worktree based on the previous PR branch, the FULL canonical contract text, and exact assigned Arbor objective. Agent must verify repository identity, base SHA, stack relationship and policy gates before editing. No automatic merge, deployment or production changes. ChatGPT transfers completed T3 results and reviews into Arbor.

Recovery provenance: full text from the same prior T3 handoff cited in [reconciled architecture](reconciled-architecture.md); recovered before PR8 edits. This historical plan does not resolve D01–D12.

