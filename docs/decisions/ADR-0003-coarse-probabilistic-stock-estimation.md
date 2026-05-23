# ADR-0003: Coarse probabilistic stock estimation

## Status

Accepted

## Context

Receipts prove acquisition, not possession.

The system cannot reliably know:

- exact consumption
- spoilage
- sharing
- discarded items
- meal preparation usage

Attempting exact inventory precision would create misleading outputs.

## Decision

Inventory will use coarse probabilistic states:

- none
- low
- available
- stocked
- unknown

Stock estimation should consider:

- purchase recency
- item perishability
- purchase cadence
- category heuristics
- manual corrections

## Consequences

### Positive

- more trustworthy recommendations
- fewer false claims
- simpler UX
- easier automation logic

### Negative

- less precise inventory counts
- harder advanced meal planning
- limited nutrition precision

## Notes

Recommendation systems should explain rationale.

Example:

- tofu likely low because last purchase was 13 days ago
- frozen vegetables likely stocked due to recent multiple purchases
- produce likely aging based on category decay windows
