# ADR-0006: Public Code with Private Cloudflare Operating Substrate

## Status

Accepted

## Context

The repository is public, while real shopping evidence and household purchase history are private and can reveal sensitive routines, locations, spending, diet, health-adjacent purchases, household composition, and other patterns.

The earlier spreadsheet-first plan left authority, file storage, API access, privacy enforcement, and automation boundaries insufficiently separated. Subsequent privacy incidents and implementation work demonstrated the need for a private application boundary that remains portable and testable.

## Decision

Adopt the following architecture:

- public GitHub stores only source, schemas, migrations, documentation, and materially synthetic fixtures;
- Cloudflare Worker is the supported authenticated application/API boundary;
- Cloudflare D1 is the preferred authoritative structured datastore;
- Cloudflare R2 stores private receipt images and large source/evidence payloads under opaque keys;
- SQLite-compatible semantics remain a portability, local-validation, export, and recovery target where practical;
- Google Sheets and CSV are optional export/review surfaces, never authoritative project storage;
- raw/AI evidence cannot directly mutate authoritative purchases or derived stock;
- authoritative purchases require the canonical review/promotion boundary;
- stock, budget outputs, and recommendations remain recomputable derived state unless a future ADR explicitly changes that boundary.

## Security consequences

- real household data must never enter public Git, including temporary branches, PRs, issues, CI artifacts, or examples;
- Worker/D1/R2 credentials and deployable resource identifiers remain outside the public repository;
- D1/R2 should not be exposed as direct client interfaces;
- public CI remains synthetic and credential-free;
- external integrations such as n8n/Gmail must enter through the private/canonical ingestion path and cannot bypass review/authority boundaries.

## Portability consequences

Choosing Cloudflare as the operating substrate does not make Cloudflare-specific representation part of the domain contracts.

- canonical JSON contracts remain provider-independent;
- D1 migrations stay within supported SQLite semantics where practical;
- deterministic export/restore is a required operational capability;
- replacing the private provider in the future requires a demonstrated operational need and a new ADR, not a second concurrent source of truth.

## Alternatives considered

### Google Sheets as primary storage

Rejected as the authoritative store. Sheets remains useful for human review and external budget/reporting surfaces, but it is a poor boundary for private evidence, schema enforcement, transactional promotion, and authenticated APIs.

### PocketBase or another lightweight backend

Deferred/superseded as an active path. It may be reconsidered only if future requirements materially exceed the Cloudflare substrate and portability contracts make migration preferable to operating two backends.

### Hosted Postgres/custom backend

Not justified for the current single-household workload. Reconsider only when concrete scale, relational, multi-user, operational, or governance requirements demand it.

## Guardrails

- one authoritative structured datastore at a time;
- no provider-specific fields in canonical domain contracts unless unavoidable and explicitly documented;
- no product feature may bypass the evidence → review → authoritative purchase boundary;
- derived outputs remain explainable and traceable to authoritative/derived evidence;
- architecture changes that alter authority, privacy, or provider boundaries require an ADR.
