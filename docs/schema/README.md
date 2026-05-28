# Sheet Schema Overview

This directory defines the canonical spreadsheet schema for the Shopping Inventory MVP.

The early system uses Google Sheets as the operating datastore. These schemas are intentionally explicit because Sheets is flexible enough to drift unless the project defines stable tab names, column names, states, and promotion rules.

## Principles

- Raw import tabs are append-only evidence
- Reviewed purchase rows are the authoritative ledger
- Derived tabs are recomputable from authoritative inputs
- AI output carries confidence and provenance, not silent authority
- Every promoted row must preserve traceability back to raw evidence
- Manual corrections should be represented as review or override data, not destructive edits to raw imports

## Canonical tabs

| Tab | Class | Purpose |
| --- | --- | --- |
| `Import_Raw` | Raw evidence | OCR / extraction rows from receipt images |
| `Orders_Raw` | Raw evidence | Email and ecommerce order imports |
| `Deals_Raw` | Raw evidence | Flyer, promo, and web deal captures |
| `Review_Queue` | Review surface | Low-confidence or ambiguous rows requiring review |
| `Purchases` | Authoritative ledger | Reviewed and normalized purchase records |
| `Aliases` | Reference data | Raw patterns mapped to canonical items |
| `Stock` | Derived view | Coarse probabilistic inventory state |
| `Budget_Export` | Derived view | Monthly/category rollups for external budgeting |

## Shared column conventions

| Column suffix / field | Meaning |
| --- | --- |
| `_id` | Stable identifier unique within its domain |
| `_at` | ISO-8601 timestamp |
| `_source` | Human-readable source system or workflow |
| `_confidence` | Decimal confidence from 0.0 to 1.0 |
| `_notes` | Human-readable notes, ambiguity, or rationale |

## Common enums

### Review state

- `new`
- `needs_review`
- `reviewed`
- `promoted`
- `rejected`
- `duplicate`

### Stock state

- `none`
- `low`
- `available`
- `stocked`
- `unknown`

### Source type

- `receipt_photo`
- `email_receipt`
- `ecommerce_order`
- `flyer`
- `manual_entry`
- `correction`

## Schema governance

Schema changes should be documented before changing automation. For non-breaking additions, add nullable columns to the end of a tab. For breaking changes, add a migration note and update fixtures/evaluation cases before changing workflows.
