# ADR-0005: Defer Backend Provider Selection

## Status

Proposed

## Context

The MVP intentionally starts with Google Sheets as the operating datastore. This keeps the system inspectable, low-cost, easy to correct manually, and compatible with AI-assisted review workflows.

However, spreadsheet limits may become painful as the system adds:

- more receipt/order history
- richer canonical item models
- price history analytics
- recommendation history
- stronger validation requirements
- repeatable tests and migrations
- API or web UI surfaces
- shared-household usage
- clearer privacy boundaries

Earlier planning mentioned Supabase/Postgres as a possible future migration path. That was too provider-specific for the current stage. The project should define requirements first and select a provider only after the spreadsheet workflow proves useful and concrete limitations appear.

## Decision

Do not select a backend provider during the MVP.

Keep the schema portable across Google Sheets, SQLite, PocketBase, hosted Postgres-compatible systems, and custom backends.

Current preference, if Sheets becomes limiting, is a local-first relational direction:

1. SQLite as the baseline durable store and test target
2. PocketBase as the leading lightweight app/backend candidate if API, auth, admin UI, or file attachment support becomes useful
3. Hosted Postgres/Supabase/Neon-style platforms as later candidates if hosted multi-user access, managed operations, or stronger cloud integration becomes necessary

## Rationale

SQLite and PocketBase better match the current project shape than a hosted backend-first approach:

- personal/single-household first
- low operational overhead
- local-first or self-hostable
- easy backups and exports
- deterministic schema migrations
- strong fit for fixtures and normalization tests
- less premature infrastructure commitment

PocketBase is attractive because it provides SQLite plus an API, auth, admin UI, and file handling in a small deployable package. SQLite alone remains attractive for CLI-first workflows, deterministic tests, and local automation.

## Provider selection triggers

Revisit backend/provider selection when one or more are true:

- Google Sheets formulas/scripts become slow or brittle
- row counts make review/filtering painful
- schema validation exceeds what Sheets can safely enforce
- alias and canonical item management needs stronger constraints
- local tests need a realistic durable store
- receipt image/file attachment handling becomes important
- n8n/Apps Script logic becomes hard to test
- API or web/mobile UI becomes a serious target
- multiple people need distinct access scopes
- price history or recommendation analytics need SQL

## Candidate classes

| Class | Examples | When it fits |
| --- | --- | --- |
| Spreadsheet-first | Google Sheets, Airtable, Baserow | MVP, review workflows, low-code correction |
| Local relational | SQLite, DuckDB | local-first, testable, portable, automation-driven |
| Lightweight app backend | PocketBase | SQLite-backed API/admin/auth/file surface |
| Hosted Postgres platform | Supabase, Neon, Railway Postgres, Crunchy Bridge | hosted SQL, app/API, managed operations |
| App-first BaaS | Firebase, Appwrite | app-centric workflows, realtime, managed auth |
| Custom backend | FastAPI, Node, Rails, Phoenix + database | maximum control, higher maintenance |

## Target ownership after migration

If a backend is introduced, authoritative data should move deliberately. Sheets may remain a review/reporting surface.

| Data | Future owner |
| --- | --- |
| Raw imports | Selected backend or local database |
| Purchases ledger | Selected backend or local database |
| Canonical items / aliases | Selected backend or local database |
| Stock estimates | Derived table/view/cache |
| Budget exports | Generated view/export job |
| Review queue | Backend table plus optional Sheet view |
| Reports | App/UI/Sheet export |

## Data model preservation

Current sheet schemas should map cleanly to relational tables:

- `Import_Raw` -> `raw_receipt_lines`
- `Orders_Raw` -> `raw_order_lines`
- `Deals_Raw` -> `raw_deals`
- `Purchases` -> `purchases`
- `Aliases` -> `item_aliases`
- canonical item metadata -> `canonical_items`
- `Stock` -> `stock_estimates`
- `Budget_Export` -> `budget_exports` or generated view
- `Review_Queue` -> `review_tasks`

## Evaluation requirements before selection

Before choosing a provider, compare candidates against:

- data portability
- relational integrity
- local development experience
- backup/restore story
- file attachment handling
- API surface
- auth/visibility model
- automation compatibility
- operational burden
- cost
- migration complexity
- ability to keep Sheets as review/report surface

## Migration strategy

1. Freeze current sheet schema version
2. Export canonical tabs as CSV or JSONL
3. Build SQLite-compatible schema first where possible
4. Import raw evidence first
5. Import purchases and aliases
6. Recompute stock from imported purchases
7. Validate budget exports against sheet outputs
8. Run OCR normalization evaluation corpus against the backend-backed pipeline
9. Keep Sheets read-only or use them as review/reporting surfaces
10. Move automation writes only after idempotency and rollback behavior are clear

## Reversibility

The system should be able to export authoritative data back to Sheets during transition. Avoid provider designs that strand data in an app-only or vendor-specific format too early.

## Decision guardrail

The project should adopt a backend because the workflow has proven valuable and Sheets has become limiting, not because a backend feels more architecturally complete.
