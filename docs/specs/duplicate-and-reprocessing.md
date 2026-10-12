# Duplicate and Reprocessing Policy

## Purpose

Duplicate handling separates **operation idempotency**, **exact evidence identity**, and **transaction similarity**. Only exact evidence identity is strong enough to reuse an existing object automatically. A transaction fingerprint is a conservative review signal, never an autonomous duplicate verdict.

## Transaction fingerprint

A structured receipt envelope receives a private SHA-256 fingerprint only when all strong fields are available:

- merchant identity after NFKC normalization, trim, lowercase, and whitespace collapse; for `order_email` only, source ID may be used when merchant identity is absent;
- purchase timestamp rounded down to the UTC minute;
- ISO currency code;
- receipt total formatted to two decimals.

The clear-text fingerprint projection is not persisted. D1 stores only the SHA-256 value.

If any required signal is missing, the fingerprint is `NULL` and no duplicate relationship is inferred.

## Collision semantics

A fingerprint collision across distinct envelope IDs means **needs review**, not **is duplicate**.

- The earlier envelope is left unchanged.
- The later colliding envelope is preserved and moves from `clear` to `needs_review`.
- Evidence/raw rows remain immutable.
- Promotion from a colliding envelope is blocked until a duplicate decision exists.

This asymmetry avoids retroactively freezing already-reviewed history while preventing a second acquisition from newly observed similar evidence.

## Duplicate decisions

`duplicate_events` is append-only and attributable.

Allowed decisions for a `needs_review` envelope:

- `distinct` — the collision was a false positive or legitimate repeated purchase; normal candidate approval/promotion may continue.
- `confirmed_duplicate` — the evidence is retained for provenance but cannot create an authoritative acquisition.

Direct duplicate-state rewrites are rejected. Event sequence, actor identity, timestamp, reason/correlation provenance, and current projected state are validated by D1.

## Promotion boundary

Candidate approval and Purchase insertion both fail when the owning envelope is:

- `needs_review`; or
- `confirmed_duplicate`.

The second check is defense in depth for alternate/direct persistence writers.

## Reprocessing

Changing normalization rules does not create another raw evidence record.

1. Preserve the original `ImportRawRow`.
2. Create a new immutable `PurchaseCandidate` for that same raw row.
3. Review the candidate normally.
4. If the raw row already has a current effective Purchase, the new Purchase must set `supersedes_id` to that current Purchase.
5. The prior Purchase remains immutable and the existing purchase audit trigger records the supersession.

This makes reprocessing a correction chain rather than a second acquisition.

## Non-goals

- fuzzy retailer-specific matching;
- ML duplicate classification;
- silently merging similar baskets;
- deleting uncertain evidence;
- treating fingerprint equality as proof;
- generalized event sourcing.
