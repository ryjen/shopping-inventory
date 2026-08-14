#!/usr/bin/env bash
set -euo pipefail

DB_NAME="shopping-inventory-dev"

run_sql() {
  local file="$1"
  npx wrangler d1 execute "$DB_NAME" --local --file="$file"
}

expect_failure() {
  local name="$1"
  local file="$2"
  local output

  if output="$(run_sql "$file" 2>&1)"; then
    echo "authoritative-d1: expected ${name} to fail, but it succeeded" >&2
    exit 1
  fi

  # The fixtures are synthetic, but keep CI output bounded and avoid echoing SQL/data.
  echo "authoritative-d1: ${name}: rejected as expected"
}

run_sql test/fixtures/d1/authoritative-positive.sql >/dev/null

echo "authoritative-d1: positive promotion/correction path: passed"
expect_failure "non-item candidate provenance" test/fixtures/d1/authoritative-non-item-negative.sql
expect_failure "unapproved purchase promotion" test/fixtures/d1/authoritative-unapproved-negative.sql
expect_failure "correction fork" test/fixtures/d1/authoritative-fork-negative.sql
expect_failure "post-promotion approval rewrite" test/fixtures/d1/authoritative-approved-state-negative.sql
expect_failure "authoritative purchase in-place update" test/fixtures/d1/authoritative-purchase-update-negative.sql
