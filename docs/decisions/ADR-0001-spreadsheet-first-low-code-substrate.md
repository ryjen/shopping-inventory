# ADR-0001: Spreadsheet-first low-code substrate

## Status

Accepted

## Context

The project aims to rapidly validate usefulness before introducing operational complexity.

A custom backend and frontend would increase:

- maintenance burden
- authentication requirements
- infrastructure costs
- synchronization complexity
- governance overhead

Google Sheets already provides:

- persistence
- sharing
- manual correction workflows
- formulas
- filtering
- automation compatibility
- AI interoperability

## Decision

Use Google Sheets as the primary operational datastore during early phases.

## Consequences

### Positive

- rapid iteration
- low operational overhead
- easy inspection and debugging
- human review workflows remain simple
- easy integration with ChatGPT, Apps Script, and n8n

### Negative

- eventual scaling limits
- weak relational guarantees
- schema drift risk
- concurrency limitations
- difficult long-term analytics

## Future migration path

If spreadsheet limitations become problematic:

- move authoritative ledgers into Postgres/Supabase
- retain Sheets as reporting/review surfaces
