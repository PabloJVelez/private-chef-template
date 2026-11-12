# Verification — 2026-11-12

Baseline: `9f9e2770d43f253728aae8c790ad2561a0181c66` (PR #35). `git fetch origin main`
matched this SHA before editing and again before delivery. The T3-managed
`feat/chef-admin-ai-schedule-chat-v1` worktree started clean at exactly this commit.
No root checkout, Meal Prep branch, upgrade documentation, Node pin or booking module changed.

Implementation SHA: recorded below after committing. Evidence-only changes may follow it.
All checks use **Node 26.13.1**, **Yarn 4.5.0**, Medusa/dashboard **2.22.6**, React **18.3.1**.
The host default is Node 24; commands explicitly prepend the already-installed task tool:

```sh
export PATH=/tmp/private-chef-node26-tools/node-v26.13.1-linux-x64/bin:$PATH
```

| Exact command (from repository root unless noted) | Result |
| --- | --- |
| `corepack yarn install --immutable` | Exit 0 on clean baseline, no existing node_modules; peer warnings |
| `corepack yarn workspace medusa typecheck` | Exit 0 |
| `corepack yarn workspace storefront typecheck` | Exit 0 |
| `corepack yarn workspace medusa build` | Exit 0, backend and production Admin assets |
| `corepack yarn workspace storefront build` | Exit 0 |
| `corepack yarn workspace medusa test:unit` | Exit 0; 29 suites, 262 tests |
| `corepack yarn workspace medusa test:unit --runTestsByPath src/lib/__tests__/admin-chef-chat.unit.spec.ts` | Exit 0; all 3 mount tests, including missing-source detection |
| `corepack yarn workspace storefront test:unit` | Exit 0; 3 suites, 18 tests |
| `corepack yarn workspace medusa test:integration:http --runTestsByPath integration-tests/http/chef-workspace.spec.ts` | Exit 0; wrapper runs 5 real-DB cases |
| `corepack yarn workspace medusa lint` | Exit 0; 0 errors, 170 warnings (155 baseline plus intentional generic boundary errors / provider `store` key lint false positive) |
| `node docs/chef-ai/http-acceptance.cjs` | Exit 0 against built real Medusa; auth, schema, parser privacy, body limit, no-store |
| `node docs/chef-ai/browser-acceptance.cjs` | Exit 0 against built Admin and real Medusa; Playwright transport mock only |
| `git diff --check` | Exit 0 |

Backend unit contracts cover local relative dates and date-only windows, unknown timezone,
23/25-hour DST days, invalid/reversed/broad ranges, strict tool schema, all status categories,
protection vs appointment, empty/incomplete/oversized results, model/backend errors, prompt
boundary, denied generic/write/tools, duplicate calls, denied identity types, current-user
lookup, missing configuration, bounded history and rate/concurrency limits. SDK tests inspect
actual invocation configuration and strip model prose from the usable result.

The existing **real PostgreSQL** calendar cases verify crossing/endpoint-touching intervals,
requested/appointment/protected-time distinctions, status filtering, 1,005-event pagination,
5,001-event incomplete behavior, missing sensitive fields, unchanged database rows and a
locked-table timeout that fails instead of reporting emptiness. This is the relevant existing
read integration suite, **not** a claim that the full booking/native-worker migration suite
was rerun. Those unrelated fixtures were not invoked.

The built browser test covers real login, no chat on login, authenticated endpoint → real
OpenAI SDK with mocked HTTP response → validated tool → real persisted calendar data. It
asserts week/weekend/day results, clickable detail paths, pending/confirmed/protection,
complete absence and write refusal, disabled send/loading, Escape/focus restoration,
retained memory across Menus/Settings/event-detail navigation, light/dark/mobile bounds,
no durable chat history, refresh/logout clearing and the 429 error state. Screenshot evidence:
[light](evidence/chat-light.png), [dark/mobile](evidence/chat-dark-mobile.png).
The malformed JSON sentinel was absent from server logs and the response. Built Admin JS
contained neither `CHEF_AI_OPENAI_API_KEY` nor the fixture key marker.

T3 preview was attempted twice and failed with: “This host is missing libraries T3's browser
needs (libatk-1.0.so.0, libatk-bridge-2.0.so.0, libXcomposite.so.1, libXdamage.so.1,
libXfixes.so.3, libXrandr.so.2, libasound.so.2, libatspi.so.0).” Acceptance used local Playwright
and existing unpacked libraries instead; no host packages were installed. Browser launch:

```sh
LD_LIBRARY_PATH=/tmp/bts-browser-libs/root/usr/lib/x86_64-linux-gnu \
NODE_PATH=/home/openclaw/projects/bts/node_modules \
node docs/chef-ai/browser-acceptance.cjs
```

## Disposable fixture reproduction

No production environment files, keys or records were loaded. The task created a new
`bts11-postgres` container with loopback-only port 45432 and a synthetic `bts11_admin`
database. Its password below is a disposable fixture value. Calendar integration tests
create/drop their own `booking_test_workspace_*` database inside that same container.
No production Redis, Google, payment or email service was used. Test-mode in-memory modules
are appropriate for this read-only slice and do not prove durable job execution.

```sh
docker run -d --name bts11-postgres -p 127.0.0.1:45432:5432 \
  -e POSTGRES_PASSWORD=bts11-disposable-only postgres:16-alpine
docker exec bts11-postgres createdb -U postgres bts11_admin
export NODE_ENV=test
export DATABASE_URL=postgres://postgres:bts11-disposable-only@127.0.0.1:45432/bts11_admin
export BOOKING_TEST_DATABASE_URL=postgres://postgres:bts11-disposable-only@127.0.0.1:45432/postgres
export FILE_PROVIDER=local STRIPE_API_KEY=sk_test_fixture
export RESEND_API_KEY=re_fixture RESEND_FROM_EMAIL=fixture@example.invalid
export JWT_SECRET=bts11-disposable-jwt COOKIE_SECRET=bts11-disposable-cookie
export STORE_CORS=http://localhost:9011 ADMIN_CORS=http://localhost:9011 AUTH_CORS=http://localhost:9011
export SENTRY_DSN= CHEF_AI_SCOPE=single_site
corepack yarn workspace medusa medusa db:migrate
corepack yarn workspace medusa medusa user --email bts11@example.invalid --password FixtureBts11Only123
corepack yarn workspace medusa medusa exec ./integration-tests/chef-ai/seed.ts
export CHEF_AI_ADMIN_USER_IDS=$(docker exec bts11-postgres psql -U postgres -d bts11_admin \
  -Atc "select id from public.user where email='bts11@example.invalid'")
export CHEF_AI_OPENAI_API_KEY=fixture-not-a-real-key
export NODE_OPTIONS="--require $PWD/docs/chef-ai/fixture-provider.cjs"
cd apps/medusa/.medusa/server
node ../../node_modules/@medusajs/cli/cli.js start --port 9011 --host 127.0.0.1
```

Build first, then start from `.medusa/server`, **not Vite/develop**. Run the HTTP and browser
scripts from the repository root in another shell. Restart the fixture server between
the scripts so their intentional rate-limit assertions start from zero. The browser script
assumes the seeded week contains the synthetic weekend; use a Thursday fixture date for
exactly reproducible counts and an empty tomorrow. The seed has no external workflow writes.
The preload intercepts only OpenAI HTTP traffic and is guarded by the exact local database
name and fixture key. It is a test artifact, never a production option or an application
mock endpoint. No live model, paid call or model-secret availability is claimed.

## Limits and enablement gate

- Live model quality, ambiguous-language behavior, provider account access and real latency
  remain unverified. The mock tests tool execution, not a model's understanding. Follow the
  manual guide and offline stronger-baseline evaluation in [README.md](README.md).
- The named authorization scope is a dedicated single site, not per-chef tenancy.
- Process-local rate counters need ingress-wide enforcement for multiple workers.
- The Vite integration uses version-sensitive upstream source anchors, checked at build.
- Successful Sentry ingestion was not exercised (DSN intentionally empty); parser-response
  and server-log privacy were tested locally.
- No merge, deployment, Coolify change, production secret change or Arbor write occurred.
