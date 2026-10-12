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
    echo "duplicate-policy-d1: expected ${name} to fail, but it succeeded" >&2
    exit 1
  fi

  echo "duplicate-policy-d1: ${name}: rejected as expected"
}

run_sql test/fixtures/d1/duplicate-distinct-positive.sql >/dev/null
echo "duplicate-policy-d1: distinct duplicate-review release path: passed"

run_sql test/fixtures/d1/reprocessing-supersession-positive.sql >/dev/null
echo "duplicate-policy-d1: reprocessing supersession path: passed"

expect_failure "unresolved duplicate candidate approval" test/fixtures/d1/duplicate-unresolved-approval-negative.sql
expect_failure "confirmed duplicate candidate approval" test/fixtures/d1/duplicate-confirmed-approval-negative.sql
expect_failure "direct duplicate-state rewrite" test/fixtures/d1/duplicate-direct-state-negative.sql
expect_failure "duplicate-event rewrite" test/fixtures/d1/duplicate-event-update-negative.sql
expect_failure "duplicate-event deletion" test/fixtures/d1/duplicate-event-delete-negative.sql
expect_failure "parallel reprocessing purchase" test/fixtures/d1/reprocessing-parallel-purchase-negative.sql
