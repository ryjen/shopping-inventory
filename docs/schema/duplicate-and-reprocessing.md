# Duplicate and Reprocessing Policy

## Mental model

Idempotency and duplicate identity are different questions.

- **Idempotency** asks whether the same operation is being retried.
- **Duplicate identity** asks whether different evidence may describe the same real transaction.
- **Reprocessing** asks how a new interpretation of the same immutable raw evidence changes authority.

The system handles each boundary separately and conservatively.

## Exact evidence identity

Receipt/image uploads are SHA-256 hashed before durable storage.

The digest is private metadata. It is not a public fixture identifier and is not logged with receipt content.

Only one non-deleted `receipt_evidence` row may own a given source digest. Re-uploading identical bytes returns the existing opaque receipt/evidence IDs rather than creating a second R2 object.

This is deterministic byte identity, not fuzzy transaction inference.

## Transaction fingerprint

Structured extraction may derive a transaction fingerprint only when sufficiently strong fields exist:

- normalized merchant text;
- parsed purchase timestamp, normalized to a documented minute precision;
- currency;
- receipt/order total in minor units.

The fingerprint is a SHA-256 digest of that private projection. Clear-text merchant/timestamp/total values are not duplicated into the fingerprint column or duplicate diagnostics.

A matching fingerprint on a **different envelope ID** is not proof of duplication. The new envelope/raw evidence is preserved with:

- `duplicate_state = needs_review`;
- opaque `duplicate_of_envelope_id`;
- normal immutable source payload/provenance.

If required fields are missing, duplicate identity remains unknown/clear rather than being guessed.

## Duplicate decisions

A flagged envelope cannot create a `PurchaseCandidate` until an append-only `duplicate_event` records one of:

- `distinct`: similar transaction is legitimate; normal review/promotion may continue;
- `confirmed_duplicate`: evidence is retained but cannot create another acquisition.

Duplicate events carry actor identity, sequence, timestamp, reason/correlation metadata, and are immutable after insertion.

The current `duplicate_state` is a database-projected view of those events.

## Reprocessing

Changing normalization rules never rewrites an existing `PurchaseCandidate`.

For the same immutable `ImportRawRow`:

1. create a new candidate interpretation;
2. review/approve it through normal review events;
3. if the raw row still owns a current authoritative Purchase, the replacement Purchase must supersede that current Purchase.

This keeps candidate history, review history, and authority lineage attributable while preventing two current acquisitions from one raw line.

## Conservative boundaries

The policy does not:

- use fuzzy/ML matching to auto-delete evidence;
- treat fingerprint equality as authoritative proof;
- merge similar transactions without review;
- expose merchant/basket/private values in public logs;
- turn duplicate detection into a generalized event-sourcing system.

Retailer-specific or probabilistic matching can be added later only if real false-negative friction justifies it.
