#!/usr/bin/env bash
set -euo pipefail

DB_NAME="shopping-inventory-dev"
STATE_DIR="$(mktemp -d)"
trap 'rm -rf "$STATE_DIR"' EXIT

npx wrangler d1 migrations apply "$DB_NAME" --local --persist-to "$STATE_DIR" >/dev/null

run_sql() {
  local file="$1"
  npx wrangler d1 execute "$DB_NAME" --local --persist-to "$STATE_DIR" --file="$file"
}

expect_failure() {
  local name="$1"
  local file="$2"
  local output

  if output="$(run_sql "$file" 2>&1)"; then
    echo "review-audit-d1: expected ${name} to fail, but it succeeded" >&2
    exit 1
  fi

  echo "review-audit-d1: ${name}: rejected as expected"
}

run_sql test/fixtures/d1/review-audit-positive.sql >/dev/null
echo "review-audit-d1: append-only review and purchase audit path: passed"

expect_failure "direct candidate state rewrite" test/fixtures/d1/review-direct-state-negative.sql
expect_failure "invalid candidate transition" test/fixtures/d1/review-invalid-transition-negative.sql
expect_failure "raw evidence rewrite" test/fixtures/d1/review-raw-evidence-update-negative.sql
expect_failure "review event rewrite" test/fixtures/d1/review-event-update-negative.sql
expect_failure "review event deletion" test/fixtures/d1/review-event-delete-negative.sql
expect_failure "purchase without actor attribution" test/fixtures/d1/review-purchase-missing-actor-negative.sql
