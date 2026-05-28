# ADR-0004: Apps Script vs n8n Automation

## Status

Proposed

## Context

The project needs lightweight automation around Google Sheets, receipt/order ingestion, normalization, review queues, budget exports, and recommendation reports.

Two near-term options are attractive:

- Google Apps Script, because the MVP datastore is Google Sheets
- n8n, because it is useful for scheduled email/order/deal workflows and external integrations

The architecture should avoid prematurely committing all workflow logic to one platform.

## Decision

Use a split automation model:

- Apps Script for sheet-local actions, validation, promotion, recomputation, and user-triggered helpers
- n8n for scheduled external ingestion, Gmail/order workflows, deal/flyer collection, and cross-system orchestration

Keep core domain rules documented and portable so they can later move into a CLI, service, or Supabase/Postgres backend.

## Rationale

### Apps Script is best for

- sheet menu actions
- row validation
- promotion from `Review_Queue` to `Purchases`
- recomputing `Stock`
- generating `Budget_Export`
- simple user-triggered reports
- keeping early operations close to the spreadsheet

### n8n is best for

- Gmail/order ingestion
- scheduled workflows
- external APIs
- web/flyer/deal checks
- notification workflows
- multi-step integrations with credentials

## Consequences

### Positive

- keeps the spreadsheet MVP simple
- avoids forcing external orchestration into Sheets
- supports low-code workflows without building an app too early
- allows manual review boundaries to stay visible
- separates sheet-local logic from integration plumbing

### Negative

- two automation surfaces to document and secure
- duplicated logic risk
- credential management gets more complex
- debugging cross-system workflows can be messy

## Guardrails

- Do not duplicate core normalization rules silently across Apps Script and n8n
- Treat docs/specs as the source of truth until code exists
- n8n should append raw evidence, not promote authoritative purchases by default
- Apps Script may promote reviewed rows but must preserve provenance
- Both systems must identify themselves in `extractor`, `reviewed_by`, or audit columns

## Initial implementation recommendation

1. Manual ChatGPT receipt extraction into `Import_Raw`
2. Apps Script helpers for validation, review, promotion, and recomputation
3. n8n only after Gmail/order ingestion rules are clear
4. Add tests/fixtures before moving substantial logic into either platform

## Revisit when

- sheet-local scripts become hard to test
- n8n workflows duplicate too much logic
- multiple users need concurrent writes
- Supabase/Postgres becomes the authoritative store
- security requirements exceed low-code comfort
