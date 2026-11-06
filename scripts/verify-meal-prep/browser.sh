#!/usr/bin/env bash
# Real built storefront + Medusa Admin, disposable local PostgreSQL only.
set -euo pipefail
cd "$(dirname "$0")/../.."
ROOT=$PWD
export ROOT
export NODE_ENV=test FILE_PROVIDER=local MEDUSA_TELEMETRY_DISABLED=1
: "${DISCOVERY_BROWSER_DATABASE_URL:?Set a local disposable discovery_browser database URL}"
export DATABASE_URL=$DISCOVERY_BROWSER_DATABASE_URL
export STRIPE_API_KEY=sk_test_verification_only STRIPE_WEBHOOK_SECRET=whsec_verification_only
export RESEND_API_KEY=re_verification_only RESEND_FROM_EMAIL=test@example.invalid
export JWT_SECRET=discovery-local-test-only COOKIE_SECRET=discovery-local-test-only
export ADMIN_CORS=http://localhost:9001 STORE_CORS=http://localhost:3000 AUTH_CORS=http://localhost:9001,http://localhost:3000
mkdir -p artifacts/meal-prep-verification
node <<'NODE'
const { Client } = require('./apps/medusa/node_modules/pg');
const url = new URL(process.env.DATABASE_URL);
if (!['localhost', '127.0.0.1'].includes(url.hostname) || url.pathname !== '/discovery_browser') throw new Error('Disposable local discovery_browser DB required');
url.pathname = '/postgres';
(async () => {
  const client = new Client({ connectionString: url.href }); await client.connect();
  const found = await client.query("select 1 from pg_database where datname = 'discovery_browser'");
  if (found.rowCount) throw new Error('Fixture database already exists; use a clean disposable test server');
  await client.query('create database discovery_browser'); await client.end();
})();
NODE
(
  cd apps/medusa
  node node_modules/@medusajs/cli/cli.js db:migrate
  node node_modules/@medusajs/cli/cli.js exec ./src/scripts/verify-meal-prep-discovery.ts
  node node_modules/@medusajs/cli/cli.js user --email discovery@example.invalid --password discovery-local-test-only
) > artifacts/meal-prep-verification/browser-setup.log 2>&1
(
  cd apps/medusa/.medusa/server
  exec node ../../node_modules/@medusajs/cli/cli.js start --port 9001
) > artifacts/meal-prep-verification/browser-medusa.log 2>&1 &
MEDUSA_PID=$!
STOREFRONT_PID=''
cleanup() {
  kill "$MEDUSA_PID" ${STOREFRONT_PID:+"$STOREFRONT_PID"} 2>/dev/null || true
}
trap cleanup EXIT
export MEDUSA_PUBLISHABLE_KEY
MEDUSA_PUBLISHABLE_KEY=$(cat artifacts/meal-prep-verification/browser-publishable-key.txt)
export INTERNAL_MEDUSA_API_URL=http://127.0.0.1:9001 PUBLIC_MEDUSA_API_URL=http://127.0.0.1:9001 STOREFRONT_URL=http://localhost:3000
(
  cd apps/storefront
  export NODE_ENV=production PORT=3000
  exec node ../../node_modules/@react-router/serve/bin.js ./build/server/index.js
) > artifacts/meal-prep-verification/browser-storefront.log 2>&1 &
STOREFRONT_PID=$!
node <<'NODE'
(async () => {
  for (const url of ['http://localhost:9001/health', 'http://localhost:3000/meal-prep']) {
    const deadline = Date.now() + 45000;
    while (true) {
      try { const r = await fetch(url); if (r.ok) break; } catch {}
      if (Date.now() > deadline) throw new Error(`Test server did not start: ${url}`);
      await new Promise(r => setTimeout(r, 500));
    }
  }
})();
NODE
cd apps/storefront
if [[ ${DISCOVERY_BROWSER_DOCKER:-0} == 1 ]]; then
  docker run --rm --network host --ipc=host --user "$(id -u):$(id -g)" \
    -e DISCOVERY_BROWSER_DATABASE_URL -v "$ROOT:$ROOT" -w "$PWD" \
    mcr.microsoft.com/playwright:v1.56.1-noble node ../../node_modules/@playwright/test/cli.js test
else
  node ../../node_modules/@playwright/test/cli.js test
fi
