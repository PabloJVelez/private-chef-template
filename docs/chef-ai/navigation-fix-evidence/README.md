# PR #38 navigation-context correction

Implementation: `b33d8a6518f6cdb4bf04f5113642c0cff508b6f2`, based on reviewed head `cf9336d799addbdb2b6139a4996708afb22fd294`. The following evidence-only commit does not change application, dependency, test or configuration files. The implementer performed these checks; this is not an independent re-review or a new confidence grade.

Navigation clears answer edit contexts, active clarification and unused proposal state before paint. Visible chat history and unresolved attempted-write recovery remain. Existing generation tickets suppress late responses. A fresh explicit card selection remains possible through authoritative preview.

## Results

- 38 targeted UI tests passed, including event A → event B → “move it”, late read completion, and unresolved attempted-write preservation.
- The same new test file run on the old reviewed source fails specifically on the stale event A context (37 pass / 1 fail). Late-response suppression already passed on the original code.
- 35 unit suites / 416 tests passed.
- Both workspace typechecks and full production builds exited 0. Medusa backend and frontend both completed. Existing build warnings remain in the log.
- All five PostgreSQL/HTTP integration wrappers passed (15 outer tests), including 53 schedule cases, persistent Redis/process recovery and nine generic workflow denial scenarios. The other nested workspace, booking and scheduling suites each passed five cases.
- Built Admin with intercepted synthetic APIs passed: desktop/mobile, light/dark, owner prompts, explicit confirmation, recovery, and navigation context. 32 previews / 5 explicit confirmations / 2 recoveries; zero browser errors or unmocked routes. The navigation scenario retains the old card, sends only the latest message and causes no write/preview. Screenshot visually inspected.
- `git diff --check` passed.

## Reproduction

Use Node 26.13.1 and the pinned `.yarn/releases/yarn-4.5.0.cjs` from the repository root:

```sh
node .yarn/releases/yarn-4.5.0.cjs workspace medusa test:unit
node .yarn/releases/yarn-4.5.0.cjs workspace medusa typecheck
MEDUSA_DISABLE_TELEMETRY=true node .yarn/releases/yarn-4.5.0.cjs workspace medusa build
node .yarn/releases/yarn-4.5.0.cjs workspace storefront typecheck
node .yarn/releases/yarn-4.5.0.cjs workspace storefront build
```

From `apps/medusa`, set `BOOKING_TEST_DATABASE_URL` and `AVAILABILITY_TEST_DATABASE_URL` to a disposable loopback PostgreSQL database named `booking_test_*`, plus `BOOKING_TEST_REDIS_URL` to disposable loopback Redis. Run:

```sh
node ../../.yarn/releases/yarn-4.5.0.cjs test:integration:http --runTestsByPath integration-tests/http/schedule-edit.spec.ts integration-tests/http/chef-workspace.spec.ts integration-tests/http/booking-scheduling.spec.ts integration-tests/http/scheduling-domain.spec.ts integration-tests/http/availability-concurrency.spec.ts
```

From the root, with Playwright and Chromium available, run `node docs/chef-ai/pending-schedule-ui-acceptance.cjs`. This run reused installed dependencies and the documented `NODE_PATH=/home/openclaw/projects/bts/node_modules` / `LD_LIBRARY_PATH=/tmp/bts-browser-libs/root/usr/lib/x86_64-linux-gnu` browser setup. It is not a clean-install claim.

## Limits and setup recoveries

The first integration invocation was rejected by the fixture's required `booking_test_` database-name guard. The rerun used a new correctly named database. The first browser invocation reached the added navigation scenario while still at mobile width; the final harness explicitly restores desktop width before using the sidebar. Both corrected runs completed successfully without application changes.

No live-model smoke ran: neither local nor Gateway environment exposed a model API credential. Model quality and live-provider behavior remain unverified. The older authenticated `browser-acceptance.cjs` empty-message assertion was corrected to the current API wording but that separate full-server harness was not rerun. No hosted application CI, deployment, production writes, Google or customer-email proof is claimed. No production configuration was changed.
