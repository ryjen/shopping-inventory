# Next Steps

The repository has completed the initial privacy/schema foundation and the synthetic end-to-end acceptance path. The active work is now hardening provenance, duplicate handling, validation, and the private operational environment before broad product expansion.

## Completed foundation

Merged repository work now provides:

- public-code/private-data enforcement and incident remediation;
- authenticated Worker + private R2 evidence storage;
- structured D1 receipt-extraction staging;
- executable JSON Schema contracts for receipt → purchase;
- D1/SQLite candidate and immutable-purchase invariants;
- deterministic synthetic receipt → review → purchase → stock → budget → recommendation acceptance coverage.

These are no longer planning tasks.

## Repository hardening track

### 1. Append-only review/audit semantics — #14

Outcome:

- approval, rejection, override, and correction decisions are attributable and append-only;
- mutable review-state projections cannot silently diverge from permitted event history;
- audit metadata remains payload-minimal.

Exit criteria:

- synthetic transition tests cover valid and invalid review paths;
- authoritative evidence remains immutable;
- review/correction actions have durable actor and provenance evidence.

### 2. Cross-ingestion duplicate/reprocessing policy — #13

Outcome:

- retries remain idempotent;
- distinct evidence representing the same transaction is detected or routed to review;
- legitimate similar purchases are not silently collapsed;
- normalization-rule reprocessing has defined authoritative behavior.

Exit criteria:

- exact, near-duplicate, retry, and reprocessing fixtures are executable;
- reviewer override is attributable.

### 3. Repository validation completion — #8

Outcome:

- documentation links and remaining JSON/JSONL/CSV fixture families have deterministic validation;
- contributors have one documented local validation entry point equivalent to required CI.

Exit criteria:

- stale/broken docs and malformed remaining fixture formats fail CI without production credentials.

### 4. Evaluation corpus expansion — #4

Outcome:

- synthetic normalization, classification, duplicate, review-routing, stock-decay, and budget cases cover the important failure modes discovered by the vertical slice.

Exit criteria:

- corpus changes have expected outputs;
- ambiguous cases intentionally remain reviewable rather than silently canonicalized.

## Operational private-environment track

### Provision and operate private D1/R2 — #18

This work can proceed independently where private Cloudflare credentials/resources are available.

Outcome:

- isolated private development/production D1 and R2 resources;
- deployed authenticated Worker;
- one real receipt can traverse the private path without Git/Sheets/public intermediates;
- retention/deletion, export/restore, credential rotation, quota/cost controls are documented and tested.

Repository CI must remain synthetic and credential-free.

## Product expansion after hardening

The following remain downstream:

- #23 Gmail/ecommerce receipt ingestion;
- #24 explained shopping/deal recommendations;
- #25 meal-planning/nutrition-aware suggestions;
- #26 external budget spreadsheet export.

They must consume the canonical/private substrate rather than introduce parallel truth stores.

## Current priority

For repository-only work:

1. #14 review/audit event semantics
2. #13 duplicate/reprocessing policy
3. #8 validation completion
4. #4 evaluation corpus expansion

For private operations, #18 may proceed in parallel when the private Cloudflare environment is available.
