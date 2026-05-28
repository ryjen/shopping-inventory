#!/usr/bin/env bash
set -euo pipefail

workflow_dir="${1:-automation/n8n}"
n8n_bin="${N8N_BIN:-n8n}"

if ! command -v "$n8n_bin" >/dev/null 2>&1; then
  cat >&2 <<MSG
n8n CLI not found.

Install n8n or run with N8N_BIN pointing at the executable, then retry:
  npm install -g n8n
  npm run test:n8n:import

The CLI smoke test uses:
  n8n import:workflow --input=<workflow.json>
MSG
  exit 127
fi

export N8N_USER_FOLDER="${N8N_USER_FOLDER:-$(mktemp -d)}"
export DB_TYPE="${DB_TYPE:-sqlite}"
export DB_SQLITE_POOL_SIZE="${DB_SQLITE_POOL_SIZE:-1}"
export N8N_ENCRYPTION_KEY="${N8N_ENCRYPTION_KEY:-shopping-inventory-local-test-key}"

shopt -s nullglob
workflows=("$workflow_dir"/*.n8n.json)

if [[ ${#workflows[@]} -eq 0 ]]; then
  echo "No n8n workflows found under $workflow_dir" >&2
  exit 1
fi

for workflow in "${workflows[@]}"; do
  echo "Import-smoke testing $workflow"
  "$n8n_bin" import:workflow --input="$workflow"
done
