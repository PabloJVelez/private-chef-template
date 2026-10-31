#!/usr/bin/env bash
# Explicit disposable PostgreSQL only. No production credentials or deployment.
set -euo pipefail
cd "$(dirname "$0")/../.."
ROOT=$PWD
REPORT_DIR=${REPORT_DIR:-"$ROOT/artifacts/meal-prep-verification"}
mkdir -p "$REPORT_DIR"
REPORT_DIR=$(cd "$REPORT_DIR" && pwd)
export REPORT_DIR
YARN=(node "$ROOT/.yarn/releases/yarn-4.5.0.cjs")
run() {
  local label=$1
  shift
  "$@" 2>&1 | tee "$REPORT_DIR/$label.log"
}
case "${1:-tests}" in
  tests)
    : "${MEAL_PREP_TEST_DATABASE_URL:?Set an explicit disposable test URL}"
    : "${AVAILABILITY_TEST_DATABASE_URL:?Set an explicit disposable test URL}"
    : "${TEST_DATABASE_URL:?Set an explicit disposable test URL}"
    run medusa-unit "${YARN[@]}" workspace medusa test:unit --json --outputFile="$REPORT_DIR/medusa-unit.json"
    run storefront-unit "${YARN[@]}" workspace storefront test:unit --json --outputFile="$REPORT_DIR/storefront-unit.json"
    run postgres "${YARN[@]}" workspace medusa test:integration:http --json --outputFile="$REPORT_DIR/postgres.json" --runTestsByPath \
      integration-tests/http/meal-prep-foundations.spec.ts \
      integration-tests/http/shared-scheduling.spec.ts \
      integration-tests/http/availability-concurrency.spec.ts \
      integration-tests/http/availability-save.spec.ts \
      integration-tests/http/availability-setup-migration.spec.ts
    run legacy "${YARN[@]}" workspace medusa jest --json --outputFile="$REPORT_DIR/legacy.json" --runTestsByPath \
      integration-tests/availability/legacy-migration.spec.ts --runInBand --forceExit
    node <<'NODE'
const fs = require('node:fs');
let total = 0;
for (const suite of ['medusa-unit', 'storefront-unit', 'postgres', 'legacy']) {
  const r = JSON.parse(fs.readFileSync(`${process.env.REPORT_DIR}/${suite}.json`, 'utf8'));
  if (!r.success || !r.numPassedTests || r.numFailedTests || r.numPendingTests || r.numTodoTests || r.numRuntimeErrorTestSuites)
    throw new Error(`${suite}: failed, empty, skipped, todo or runtime-error tests`);
  total += r.numPassedTests;
  console.log(`${suite}: ${r.numPassedTests} passed, no skipped tests`);
}
fs.writeFileSync(`${process.env.REPORT_DIR}/tests-summary.txt`, `${total} tests passed; none skipped\n`);
NODE
    ;;
  builds)
    run medusa-typecheck "${YARN[@]}" workspace medusa typecheck
    run storefront-typecheck "${YARN[@]}" workspace storefront typecheck
    run medusa-build "${YARN[@]}" workspace medusa build
    run storefront-build "${YARN[@]}" workspace storefront build
    ;;
  *) echo 'Usage: checks.sh tests|builds' >&2; exit 2 ;;
esac
