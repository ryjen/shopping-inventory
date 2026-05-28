# ADR-0005: Supabase/Postgres Migration Path

## Status

Proposed

## Context

The MVP intentionally starts with Google Sheets as the operating datastore. This keeps the system inspectable, low-cost, and easy to correct manually.

However, spreadsheet limits may become painful as the system adds:

- more receipt/order history
- concurrent household users
- richer canonical item models
- price history analytics
- recommendation history
- permission boundaries
- API or web UI surfaces
- repeatable tests and migrations

## Decision

Do not migrate to Supabase/Postgres during the first MVP.

Prepare for a future migration by keeping schema names, IDs, provenance, and domain boundaries explicit in the spreadsheet model.

When migration becomes necessary, move authoritative ledgers and reference data into Postgres/Supabase while retaining Sheets as an optional review/reporting surface.

## Migration triggers

Revisit migration when one or more are true:

- Google Sheets formulas/scripts become slow or brittle
- concurrent edits create correctness issues
- row counts make review and filtering painful
- permission boundaries are needed per user/category
- n8n/Apps Script logic becomes hard to test
- price history or recommendation analytics need SQL
- mobile/web UI becomes a serious target
- data validation exceeds what Sheets can safely enforce

## Target ownership after migration

| Data | Owner after migration |
| --- | --- |
| Raw imports | Postgres/Supabase |
| Purchases ledger | Postgres/Supabase |
| Canonical items / aliases | Postgres/Supabase |
| Stock estimates | Derived table/materialized view/cache |
| Budget exports | Generated view/export job |
| Review queue | App table plus optional Sheet view |
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
- `Budget_Export` -> `budget_exports` or SQL view
- `Review_Queue` -> `review_tasks`

## Supabase advantages

- relational constraints
- row-level security
- SQL analytics
- migrations
- API generation
- auth integration
- better multi-user model
- easier automated testing

## Supabase risks

- more operational complexity
- auth and RLS design burden
- backup and migration responsibility
- higher maintenance cost
- premature app-building before workflow validation

## Migration strategy

1. Freeze current sheet schema version
2. Export canonical tabs as CSV
3. Create Postgres schema and migrations
4. Import raw evidence first
5. Import purchases and aliases
6. Recompute stock from imported purchases
7. Validate budget exports against sheet outputs
8. Keep Sheets read-only or use them as review/reporting surfaces
9. Move automation writes to API/database layer

## Reversibility

The system should be able to export authoritative data back to Sheets during transition. Avoid migration designs that strand data in an app-only format too early.

## Decision guardrail

The project should migrate because the workflow has proven valuable and Sheets has become limiting, not because a custom backend feels more architecturally complete.
