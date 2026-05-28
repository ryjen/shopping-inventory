# Next Steps

This plan turns the documentation-first architecture into a usable MVP path without prematurely building a full app.

## Phase 1: Finalize sheet substrate

Goals:

- stabilize canonical tab names
- finalize required columns and enums
- define validation rules
- identify which columns are user-edited versus generated

Tasks:

- review `docs/schema/README.md`
- review `docs/schema/raw-imports.md`
- review `docs/schema/ledger-and-derived.md`
- decide whether any additional tabs are needed before creating a template
- document schema versioning conventions

Exit criteria:

- sheet schema is stable enough to create a template
- raw/import/ledger/derived ownership is clear

## Phase 2: Create sheet template and fixtures

Goals:

- make the MVP concrete and repeatable
- provide sample data without using private receipts

Tasks:

- create a Google Sheet template or CSV fixture set
- add synthetic receipt/order examples
- add expected normalized purchase outputs
- add expected review queue outputs
- add alias examples for common grocery/household items

Exit criteria:

- a new user can create the sheet structure
- sample rows can move through the documented workflow

## Phase 3: Manual receipt ingestion runbook

Goals:

- define the first usable operating workflow
- keep AI extraction bounded and reviewable

Tasks:

- use the receipt ingestion prompt contract
- append extracted rows to `Import_Raw`
- normalize rows into `Review_Queue` or `Purchases`
- recompute stock estimates
- generate a simple shopping/budget report

Exit criteria:

- one receipt can be processed end-to-end manually
- errors and ambiguities are captured rather than hidden

## Phase 4: Evaluation corpus

Goals:

- prevent alias/category/regression drift
- create a safety net before automation

Tasks:

- expand synthetic fixture corpus
- define expected normalization outputs
- add duplicate detection cases
- add review-routing cases
- add budget mapping cases
- add stock decay cases

Exit criteria:

- changes to normalization rules can be checked against examples
- ambiguous cases intentionally route to review

## Phase 5: Lightweight automation

Goals:

- automate only after the manual workflow is clear
- keep automation explainable and reversible

Candidate tasks:

- Apps Script validation helper
- Apps Script promote-reviewed-row helper
- Apps Script stock recomputation helper
- n8n Gmail/order ingestion spike
- Markdown report generator

Exit criteria:

- automation writes are idempotent
- automation preserves provenance
- low-confidence cases route to review

## Phase 6: Provider evaluation spike

Goals:

- evaluate backend providers only if Sheets becomes limiting
- keep provider choice requirements-driven

Candidate paths:

- SQLite-compatible local schema
- PocketBase prototype for API/admin/files
- hosted Postgres-compatible option if hosted access becomes necessary

Exit criteria:

- provider choice is based on demonstrated project needs
- data remains portable
- Sheets can remain a review/reporting surface if useful

## Current priority

1. Finalize sheet schemas
2. Create fixture skeletons
3. Run one manual receipt ingestion flow
4. Expand evaluation corpus
5. Add lightweight validation automation only after workflow is proven
