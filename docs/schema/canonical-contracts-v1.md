# Canonical Contracts v1

## Mental model

Each stage owns a different kind of truth. A nested extraction payload is not a purchase, and a purchase is not mutable raw evidence.

```mermaid
flowchart LR
  E[ReceiptExtractionEnvelope] --> R[ImportRawRow]
  R --> C[PurchaseCandidate]
  C -->|approved item only| P[Purchase]
  R -->|ambiguous or unsupported promotion| Q[Review]
  P --> S[Derived Stock]
  P --> B[Budget Export]
```

## Contract ownership

| Contract | Owner | Mutable fields | Purpose |
| --- | --- | --- | --- |
| `ReceiptExtractionEnvelope` | extractor | none after persistence | Preserve one extraction attempt and receipt-level context |
| `ImportRawRow` | ingestion pipeline | workflow review metadata only | Flatten line evidence for review and replay |
| `PurchaseCandidate` | normalization pipeline | review decision and explicit overrides | Propose a canonical acquisition interpretation |
| `Purchase` | reviewer/domain service | never updated in place; supersede instead | Authoritative acquisition ledger |
| `Stock` / `BudgetExport` | derived processors | fully recomputable | Operational views, never source truth |

## Required invariants

- Every record carries `schema_version` and `record_kind`.
- The published schema root accepts exactly one supported canonical record kind; arbitrary objects are invalid.
- Stable IDs are opaque and must not embed merchant, location, timestamp, or household information.
- Every downstream record traces to the immediately preceding record.
- Raw text is preserved only in extraction and raw-import contracts.
- Suggested or canonical item values never appear in raw evidence contracts.
- In v1, only `item` lines may create `PurchaseCandidate` records.
- Fees, deposits, discounts, coupons, taxes, totals, informational lines, returns, refunds, and voids cannot create authoritative purchases or increase stock in v1.
- `return` is a recognized raw evidence classification but is review-only in v1. A future version may introduce an explicit transaction/adjustment contract rather than overloading the acquisition ledger.
- Missing purchase dates remain `null`; they are not guessed into authoritative timestamps.
- Real instances live only in private D1/R2. Public fixtures are materially synthetic.

## Line classifications

| `line_type` | Financial meaning | v1 promotion behavior |
| --- | --- | --- |
| `item` | acquired product amount | may create a purchase candidate |
| `fee` | non-refundable service or handling fee | never creates a purchase |
| `deposit` | refundable container or similar deposit | never creates a purchase |
| `discount` | negative price adjustment | never creates a purchase |
| `coupon` | explicit promotional adjustment | never creates a purchase |
| `subtotal` | receipt summary | never creates a purchase |
| `tax` | tax summary | never creates a purchase |
| `total` | final receipt total | never creates a purchase |
| `informational` | loyalty/savings/message line | never creates a purchase |
| `return` | returned item evidence | review-only; no v1 promotion |
| `refund` | money returned without necessarily identifying stock movement | review-only/non-inventory |
| `void` | cancelled line | never creates a purchase |

The v1 boundary is intentionally conservative. A return changes inventory in the opposite direction from an acquisition and may not be equivalent to a refund. Modeling both through `Purchase` would make the acquisition ledger ambiguous. Until a dedicated adjustment/transaction contract is justified, return evidence remains preserved and reviewable without mutating authoritative purchase or stock state.

## Prices and weighted items

- `unit_price` is the price per declared unit.
- `extended_price` is the signed line amount after quantity multiplication and before receipt-level totals.
- Weighted items use numeric `quantity`, an explicit unit such as `kg` or `lb`, and optionally `unit_price`.
- Currency is defined at the envelope or transaction level and uses ISO 4217 codes.
- Receipt totals are reconciliation values; they do not become inventory records.

## Corrections and supersession

Raw evidence is never rewritten to correct extraction mistakes. A new extraction envelope or review event is appended.

Authoritative purchases are corrected by creating a replacement purchase with `supersedes_id` pointing to the prior purchase. Consumers select the latest non-superseded record. This preserves provenance and avoids silent history mutation.

## Review-state mutation

Evidence payload fields are immutable. Workflow metadata such as `review_state` may change, but implementations should record review events or audit entries. The row is therefore evidence-immutable, not globally append-only.

## Machine validation

`schemas/v1/shopping-inventory.schema.json` is a JSON Schema 2020-12 bundle with a validating root `oneOf` for the four v1 record kinds. CI validates the synthetic fixture with a general JSON Schema engine and also checks project-specific cross-record invariants such as provenance and promotion boundaries.

Schema validation and domain invariants are deliberately separate: JSON Schema validates the shape and local field constraints of each record, while executable tests validate relationships between records.

## Versioning

Schemas use semantic versions.

- Patch: clarifications or validator corrections that do not change accepted records.
- Minor: additive optional fields or enum values that old consumers may safely ignore.
- Major: required fields, changed meanings, removed fields, incompatible enum changes, or identifier changes.

Every breaking migration must include:

1. a new schema directory;
2. migration notes;
3. fixture migration or explicit legacy classification;
4. D1 migration impact;
5. compatibility tests.

## Publication rules

The schemas are public. Instances containing real transactions are private. Synthetic examples must invent all identifiers, merchants, dates, baskets, prices, and totals rather than redact real records.
