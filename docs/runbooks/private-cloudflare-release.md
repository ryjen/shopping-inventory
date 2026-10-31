# Private Cloudflare release: operator gate

Status: **NOT DEPLOYED** as of 2026-10-30. This is an operator procedure for #18, not an authorization to incur charges, publish household data, or bypass a review boundary.

## Scope and authority

The public repository provides Worker code, six D1 migrations, tests, and synthetic fixtures. Its `wrangler.toml` deliberately contains a placeholder database ID and is **not** deployable to real resources. Real credentials and resource identifiers must remain outside Git, PRs, CI, issues, and workflow artifacts.

Cloudflare D1 is the structured acquisition ledger; private R2 is receipt evidence. Google Drive/Sheets remain owner-only **manual staging** under ADR-0008. No automatic copy from Sheets to Cloudflare is approved. Never attach the real receipt corpus to these commands or regression tests.

## 1. Inventory and authority gate (read-only)

- Select the intended Cloudflare account explicitly and verify the account/plan, R2 eligibility, expected metering, quotas, operator permissions and domain/route. Obtain spending authority before creating billed resources.
- Identify whether existing resources are genuinely owned by this project. **Do not reuse another project's Worker, bucket, database, credentials, or domain route.**
- Confirm the target environment has a private security baseline: R2 no public access/custom domain; D1 reachable through the Worker binding only; scoped credentials; no raw-payload logging.
- Back up any existing project D1 state before schema changes. Prefer a new development environment before any production migration.
- Confirm a reachable Worker route is planned. A deployed script with `workers_dev=false` and no route is not a usable service.

## 2. Prepare isolated, ignored configuration

After approval, provision separate `shopping-inventory-dev` and `shopping-inventory-prod` D1 databases, and `shopping-inventory-receipts-dev` / `shopping-inventory-receipts-prod` private R2 buckets. Use distinct Worker names `shopping-inventory-dev` and `shopping-inventory-prod`.

For **each** environment, create `wrangler.private.toml` outside Git (ignored by `.gitignore`) as an operator-only file; do not commit it. Example shape (replace the placeholder privately, never in tracked files):

```toml
name = "shopping-inventory-dev"
main = "src/worker.mjs"
compatibility_date = "2026-08-01"
workers_dev = true

[[d1_databases]]
binding = "DB"
database_name = "shopping-inventory-dev"
database_id = "REPLACE_IN_PRIVATE_CONFIGURATION"
migrations_dir = "migrations"

[[r2_buckets]]
binding = "RECEIPTS"
bucket_name = "shopping-inventory-receipts-dev"

[vars]
ENVIRONMENT = "development"
```

For production, change all `-dev` names to `-prod`, `ENVIRONMENT` to `production`, use its **different** actual D1 ID, and set a deliberately approved route/hostname if `workers_dev=false`. Do not place `API_TOKEN`, OAuth credentials, or receipt data in TOML.

Create the private file with owner-only permissions (for example `umask 077` and `chmod 600 wrangler.private.toml`).

## 3. Read-only local preflight

From the repository root, after `npm ci` and with the pinned Node/Wrangler toolchain:

```sh
node scripts/private-config-preflight.mjs wrangler.private.toml development
npx wrangler whoami
npx wrangler deploy --dry-run --config wrangler.private.toml
```

Use `production` for the production configuration. The preflight rejects tracked/public config, bad permissions, placeholders, embedded secret fields, unexpected Worker/binding/resource names and cross-environment wiring. It does **not** parse all TOML, test Cloudflare account ownership, verify remote resource existence, verify security controls, prove credential availability, or deploy. Wrangler's dry-run checks actual configuration parsing and build. Account/resource/secret checks remain explicit operator gates.

Do **not** use `wrangler.toml` for deployment. Use `--config wrangler.private.toml` on every remote command and inspect Cloudflare account identity before continuing.

## 4. Provision, verify, and deploy (requires authorized operator)

- Create named D1/R2 resources only after spending/operations authorization. Verify name and binding match the private config.
- Provision **two distinct, high-entropy secrets** using Cloudflare's secret mechanism: `API_TOKEN` (evidence ingestion) and `OWNER_TOKEN` (review/duplicate decisions, candidate/purchase promotion). For example, use `npx wrangler secret put API_TOKEN --config wrangler.private.toml` and `npx wrangler secret put OWNER_TOKEN --config wrangler.private.toml`. Never print either token in terminals/logs or place them in TOML. **Equal/missing owner secrets fail closed** for privileged endpoints. Record names only; plan separate rotation/revocation. See [private review operations](private-review-operations.md).
- Dry-run deployment successfully, apply D1 migrations in the intended environment with `npx wrangler d1 migrations apply DB --remote --config wrangler.private.toml`, then deploy with `npx wrangler deploy --config wrangler.private.toml`. Record the deployed version/hash privately.
- Enforce an appropriate rate/abuse boundary for the authenticated personal endpoint. A static bearer token is the current minimum, not a multi-user authorization system.
- Run private *synthetic* smoke against the actual route: no-token and bad-token requests return unauthorized; valid token can write a synthetic image/PDF and stage a synthetic extraction; retry is idempotent; altered-payload ID reuse conflicts; invalid input cannot create purchases; evidence retrieval requires authentication. Do not put tokens or response payloads in public evidence.
- Only after the synthetic probe, explicitly approve a **single** real receipt via the private Worker path, confirm R2/D1 persistence, and verify no Git/CI/Sheet intermediate. Human review and promotion are separate; receipt intake alone does **not** make inventory usable.

## 5. Recovery, security and go/no-go

Before calling #18 complete:

- Test an export/restore of a populated **synthetic** D1 database into an isolated restoration destination and compare key tables, constraints, and row counts. Store real backups only in approved encrypted private storage. D1 export does **not** back up R2 evidence objects: test R2 inventory/retrieval and restoration separately.
- Document retention periods, deletion (including retained R2 objects, D1 records and backups), rotation, incident response, and operator access revocation. Restore drills must not mutate production.
- Check costs/quotas and alerting; confirm no public R2 access and no unexpected Worker route.
- Verify negative authorization and privacy behavior against the deployed exact version, document the evidence privately, and execute rollback to a known-good Worker version if gates fail.
- Reconcile any private Google Sheet/Drive receipts with canonical IDs and explicit review approval, using a separate controlled cutover; **no bulk automated migration or dual-write** is authorized by this runbook.
- Keep #18 open until all its outstanding acceptance items have first-hand evidence. Keep #10 open until GitHub Support responds and historical private diffs/commit references have been rechecked.

## Known implementation boundary

The Worker exposes receipt intake plus an owner-only review/promotion API after the associated reviewed change is deployed. There is **no browser UI**, retailer mail ingestion, or real household end-to-end qualification. Derived stock, budget, and recommendation flows remain synthetic/local; receipt intake alone does not make the application a complete household product. A real release requires first-hand validation of the [private review operation](private-review-operations.md) after deployment.
