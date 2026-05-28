# ADR-0005: Defer Backend Provider Selection

## Status

Proposed

## Decision

Do not select a backend provider during the MVP.

Keep the schema portable across Google Sheets, SQLite, PocketBase, hosted Postgres-compatible systems, and custom backends.

Current preference, if Sheets becomes limiting:

1. SQLite as the baseline durable store and test target
2. PocketBase as the leading lightweight app/backend candidate if API, admin UI, auth, or file attachment support becomes useful
3. Hosted Postgres-compatible platforms only if hosted multi-user access, managed operations, or stronger cloud integration becomes necessary

## Rationale

The project should define backend requirements before choosing a provider. SQLite and PocketBase currently fit the project shape better than a hosted backend-first approach because the system is personal/single-household first, low-maintenance, local-first friendly, exportable, and well suited to deterministic fixtures and normalization tests.

## Provider selection triggers

Revisit provider selection when Sheets becomes limiting for validation, testing, row volume, automation reliability, API/UI needs, file attachments, or shared-household workflows.

## Candidate classes

| Class | Examples | When it fits |
| --- | --- | --- |
| Spreadsheet-first | Google Sheets, Airtable, Baserow | MVP and review workflows |
| Local relational | SQLite, DuckDB | Local-first, testable, portable automation |
| Lightweight app backend | PocketBase | SQLite-backed API/admin/auth/file surface |
| Hosted Postgres platform | Supabase, Neon, Railway Postgres, Crunchy Bridge | Hosted SQL and managed app backend path |
| App-first BaaS | Firebase, Appwrite | App-centric workflows |
| Custom backend | FastAPI, Node, Rails, Phoenix | Maximum control, higher maintenance |

## Guardrail

Adopt a backend only because the workflow has proven valuable and Sheets has become limiting, not because a backend feels more architecturally complete.
