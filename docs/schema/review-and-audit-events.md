# Review and Audit Events

## Purpose

Review state is a workflow projection, not mutable historical truth.

The persistence model therefore separates:

- immutable extraction/raw evidence;
- immutable normalization candidates;
- append-only review decisions;
- immutable authoritative purchases;
- append-only audit evidence for promotion and correction.

## Review event model

`review_events` records state transitions for `ImportRawRow` and `PurchaseCandidate`.

Each event contains:

- target kind and opaque target ID;
- monotonically increasing per-target sequence;
- actor kind: `user`, `automation`, or `system`;
- actor ID;
- explicit `from_state` and `to_state`;
- optional bounded reason code/correlation ID;
- timestamp;
- payload-minimal JSON metadata.

The database applies the event to the target row. Direct review-state updates without a matching next event are rejected.

### Raw-row transitions

Allowed transitions:

- `new → needs_review`
- `new → approved`
- `new → rejected`
- `needs_review → approved`
- `needs_review → rejected`

### Candidate transitions

A new `PurchaseCandidate` always starts at `needs_review`.

Allowed terminal transitions:

- `needs_review → approved`
- `needs_review → rejected`

A changed normalization interpretation creates a new candidate rather than rewriting the existing candidate.

## Evidence immutability

`receipt_extraction_envelopes` cannot be updated in place.

`import_raw_rows` may change only their event-projected `review_state` and `review_version`; extraction/provenance fields are immutable.

Authoritative `Purchase` records remain immutable under the existing supersession model.

Deletion/retention is intentionally separate operational policy owned by #18; this contract is about mutation/history semantics.

## Purchase attribution

New purchase inserts include persistence-only `actor_id`, `actor_kind`, and optional `correlation_id`.

A database trigger appends:

- `purchase_promoted` for a new authoritative acquisition;
- `purchase_superseded` for a correction.

Audit metadata contains opaque source/supersession IDs only, not merchant, basket, raw line, or price payloads.

## Non-goals

This is not a generic event-sourcing framework.

It does not:

- persist every domain read/model computation as an event;
- replace canonical purchase records with an event log;
- define user identity/authentication itself;
- define evidence retention/deletion;
- define cross-receipt duplicate policy.

The goal is the smallest durable history needed for review accountability and authoritative mutation provenance.
