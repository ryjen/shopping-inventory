#!/usr/bin/env bash
set -euo pipefail

# Isolated, entirely synthetic local D1 export/restore test. Never use remote.
REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
WRANGLER="$REPO_ROOT/node_modules/.bin/wrangler"
DB_NAME="shopping-inventory-dev"
if [[ ! -x "$WRANGLER" ]]; then
  echo "d1-restore: pinned local Wrangler required (npm ci)" >&2
  exit 1
fi

TEMP_ROOT="$(mktemp -d)"
trap 'rm -rf -- "$TEMP_ROOT"' EXIT
mkdir -p "$TEMP_ROOT/source" "$TEMP_ROOT/recovered"
cp "$REPO_ROOT/wrangler.toml" "$TEMP_ROOT/source/wrangler.toml"
cp "$REPO_ROOT/wrangler.toml" "$TEMP_ROOT/recovered/wrangler.toml"
cp -R "$REPO_ROOT/migrations" "$TEMP_ROOT/source/migrations"

# Populate ONLY a throwaway local database with invented transactions.
"$WRANGLER" d1 migrations apply "$DB_NAME" --local --cwd "$TEMP_ROOT/source" >/dev/null
"$WRANGLER" d1 execute "$DB_NAME" --local --cwd "$TEMP_ROOT/source" \
  --file "$REPO_ROOT/test/fixtures/d1/review-operator-path.synthetic.sql" >/dev/null

# The export is SQL, not a storage backup of separate R2 object evidence.
"$WRANGLER" d1 export "$DB_NAME" --local --cwd "$TEMP_ROOT/source" \
  --output "$TEMP_ROOT/synthetic-d1.sql" --skip-confirmation >/dev/null
test -s "$TEMP_ROOT/synthetic-d1.sql" || {
  echo "d1-restore: export is empty" >&2
  exit 1
}

# Restore into a different isolated local D1 instance, not the source.
"$WRANGLER" d1 execute "$DB_NAME" --local --cwd "$TEMP_ROOT/recovered" \
  --file "$TEMP_ROOT/synthetic-d1.sql" >/dev/null
"$WRANGLER" d1 execute "$DB_NAME" --local --cwd "$TEMP_ROOT/recovered" \
  --command "SELECT CASE WHEN
     (SELECT COUNT(*) FROM purchases WHERE purchase_id = 'purchase_syn_operator') = 1
     AND (SELECT COUNT(*) FROM import_raw_rows WHERE envelope_id = 'env_syn_operator') = 2
     AND (SELECT COUNT(*) FROM review_events WHERE actor_id = 'owner_api_token') = 4
     AND (SELECT COUNT(*) FROM audit_events WHERE target_id = 'purchase_syn_operator'
          AND action = 'purchase_promoted') = 1
     AND (SELECT COUNT(*) FROM sqlite_master WHERE type = 'trigger'
          AND name = 'purchases_reject_update') = 1
     THEN 1 ELSE json_extract('invalid-json', '$') END AS restored;" >/dev/null

echo "d1-restore: synthetic export, isolated restore, provenance and trigger check: passed"
