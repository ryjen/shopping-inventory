# Normalization Pipeline Specification

The normalization pipeline turns private raw evidence into reviewed, authoritative acquisition records without allowing AI/OCR output to silently mutate household truth.

## Authority model

The canonical path is:

```mermaid
flowchart LR
  E[ReceiptExtractionEnvelope]
  R[ImportRawRow]
  C[PurchaseCandidate]
  Rev[Review event]
  P[Purchase]
  D[Derived stock / budget / recommendations]

  E --> R
  R --> C
  C --> Rev
  Rev -->|approved| P
  P --> D
```

Cloudflare D1 is the preferred authoritative structured datastore. Google Sheets/CSV may expose optional review or export views, but they are not the normalization source of truth.

## Goals

- preserve extraction/raw evidence unchanged;
- produce deterministic candidate interpretations;
- route ambiguity, duplicate risk, and policy-sensitive cases to review;
- maintain provenance from Purchase back to candidate/raw/evidence;
- make promotion idempotent and auditable;
- keep derived inventory/reporting state recomputable.

## Non-goals

- exact current inventory truth;
- exact nutrition tracking;
- autonomous destructive mutation;
- perfect parsing across every merchant/source;
- using a spreadsheet as a parallel authoritative ledger.

## Stages

### 1. Validate and stage evidence

Input is a versioned `ReceiptExtractionEnvelope` or a future source-specific envelope that maps into the same private staging boundary.

The Worker validates the contract and persists immutable evidence/raw rows in private D1/R2. Invalid or oversized input fails before authoritative state is touched.

### 2. Parse and normalize one raw item line

Only an inventory-bearing `item` line may produce a `PurchaseCandidate`.

Candidate interpretation may include:

- canonical item ID;
- quantity/unit;
- acquisition amount;
- normalization confidence;
- traceable source import ID.

The raw row remains unchanged.

### 3. Evaluate duplicate risk

Duplicate handling has three distinct levels:

- **operation idempotency:** replaying the same envelope/candidate operation does not create duplicate state;
- **exact evidence identity:** byte-identical receipt evidence reuses the active object by private SHA-256 identity;
- **transaction similarity:** a deterministic private fingerprint may flag distinct envelopes that share normalized merchant/order identity, UTC-minute purchase time, currency, and total.

A transaction fingerprint collision is **not proof**. The later envelope is preserved and routed to duplicate review. An attributable append-only decision marks it `distinct` or `confirmed_duplicate`; unresolved/confirmed state blocks authoritative promotion.

If strong fingerprint inputs are missing, no similarity conclusion is invented.

See [Duplicate and reprocessing policy](duplicate-and-reprocessing.md).

### 4. Canonicalize

Alias/category/unit logic produces a proposed interpretation. AI/semantic matching may suggest values but does not create authoritative aliases or purchases by itself.

Unknown values remain unknown rather than being invented.

### 5. Score confidence and risk

Signals may include:

- extraction/parse confidence;
- alias/category confidence;
- quantity confidence;
- duplicate risk;
- source quality;
- policy-sensitive category flags.

Confidence is advisory. Any unresolved duplicate or sensitive-policy risk can force review regardless of numeric score.

### 6. Review

A `PurchaseCandidate` starts at `needs_review`.

Approval/rejection is recorded as an append-only review event with actor attribution. D1 projects the current review state from permitted event transitions; direct state rewrites are rejected.

See [Review and audit events](../schema/review-and-audit-events.md).

### 7. Promote

Only an approved candidate backed by an `item` raw row may produce an authoritative `Purchase`.

Persistence enforces:

- one Purchase per source candidate;
- approved-only promotion;
- immutable Purchase records;
- corrections by superseding insert rather than update;
- reprocessing the same raw row must supersede its current effective Purchase;
- unresolved/confirmed transaction duplicate risk blocks promotion;
- actor-attributed promotion/correction audit events.

Re-running the same promotion does not create another authoritative purchase.

### 8. Derive

Stock snapshots, budget exports, and shopping recommendations consume authoritative Purchases. They are recomputable outputs rather than alternate truth stores.

## Error/risk handling

| Condition | Result |
| --- | --- |
| Missing optional price/date detail | Preserve unknown/null semantics; review if material |
| Ambiguous item interpretation | Keep candidate in review |
| Non-item receipt line | Never promote as acquisition |
| Exact retry | Idempotent response/no duplicate authoritative state |
| Possible cross-source duplicate | Preserve evidence and route later collision to append-only duplicate review |
| Invalid review transition | Reject |
| In-place evidence/candidate/Purchase rewrite | Reject |
| Inconsistent transaction reconciliation | Review |

## Auditability

An authoritative Purchase should be explainable through opaque provenance:

- source evidence/envelope/raw row;
- candidate interpretation;
- review decision and actor;
- promotion/correction audit event;
- superseded Purchase, when applicable.

Audit metadata should not duplicate merchant, basket, raw line, price, or other private payload fields unnecessarily.

## Implementation boundaries

The rules are implementation-portable, but the active operating substrate is Worker + private D1/R2.

Allowed supporting surfaces include:

- n8n for external orchestration;
- AI/OCR for untrusted extraction/suggestions;
- Google Sheets/CSV for optional human review/export;
- SQLite-compatible local validation/recovery.

None of those supporting surfaces may bypass the canonical evidence → candidate → review → Purchase authority boundary.
