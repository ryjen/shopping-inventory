# ADR-0002: Raw imports are append-only evidence

## Status

Accepted

## Context

Receipt OCR and AI normalization are probabilistic.

Directly mutating inventory from OCR output creates corruption risk.

Examples:

- hallucinated quantities
- incorrect alias resolution
- merged receipt lines
- duplicate imports
- ambiguous produce items

## Decision

Treat raw imports as immutable append-only evidence.

Never destructively edit imported OCR data.

Normalization and inventory estimation occur downstream.

## Consequences

### Positive

- auditability
- replayability
- safer normalization iteration
- easier debugging
- historical provenance retained

### Negative

- duplicated data across stages
- more processing steps
- requires promotion workflows

## Notes

Derived inventory views should always be recomputable from authoritative purchase history.
