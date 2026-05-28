# OCR Normalization Evaluation Corpus

This document defines a lightweight evaluation corpus for receipt OCR extraction and normalization correctness.

## Goals

- Measure whether raw receipt/order lines normalize correctly
- Catch alias/category regressions
- Evaluate duplicate detection behavior
- Validate confidence thresholds and review routing
- Keep automation honest before scaling ingestion

## Non-goals

- Benchmark OCR models generally
- Store sensitive real receipt images in the repo
- Optimize for exact inventory truth
- Replace manual review

## Corpus structure

Avoid storing raw sensitive receipts in the public repository. Use synthetic, redacted, or minimal examples.

Recommended structure:

```text
evaluation/
  README.md
  fixtures/
    receipt-lines.synthetic.jsonl
    order-lines.synthetic.jsonl
    aliases.synthetic.csv
  expected/
    normalized-purchases.synthetic.jsonl
    review-queue.synthetic.jsonl
  notes/
    redaction-guidelines.md
```

## Test case format

Each case should include one raw input and one expected normalization decision.

```json
{
  "case_id": "receipt_banana_abbrev_001",
  "source_type": "receipt_photo",
  "merchant_normalized": "Example Grocer",
  "raw_line_text": "BNNAS 1.23KG 2.69",
  "expected": {
    "action": "promote",
    "canonical_item_id": "bananas",
    "canonical_item_name": "Bananas",
    "category_primary": "groceries.produce",
    "quantity_value": 1.23,
    "quantity_unit": "kg",
    "price_amount": 2.69,
    "review_required": false
  }
}
```

## Required case categories

### Happy path

- clear item name
- clear price
- known alias
- known category
- no duplicate risk

### Abbreviated receipt text

- common produce abbreviations
- merchant-specific abbreviations
- truncated household item names

### Ambiguous alias

- raw text maps to multiple possible canonical items
- generic abbreviations like `ORG`, `GRN`, `CHKN`
- brand/size ambiguity

### Quantity parsing

- `2 x 500g`
- `1.23KG`
- `4L`
- `EA`
- missing quantity

### Duplicate detection

- same receipt uploaded twice
- same order imported from email and receipt
- similar but distinct purchases on same day

### Review routing

- low confidence OCR
- missing price
- missing date
- sensitive category
- inconsistent totals

### Budget mapping

- grocery categories roll up correctly
- household supplies separate from groceries
- pet categories separate from household
- excluded rows do not export

### Stock decay

- perishable recently bought -> available/stocked
- perishable old -> low/none
- non-perishable cadence item -> cadence-based state
- unknown history -> unknown

## Metrics

Suggested initial metrics:

| Metric | Definition |
| --- | --- |
| canonical accuracy | Expected canonical item ID matched |
| category accuracy | Expected category matched |
| promotion accuracy | Promote vs review decision matched |
| duplicate detection recall | Duplicate cases routed correctly |
| duplicate false positive rate | Distinct purchases not incorrectly flagged |
| quantity parse accuracy | Quantity/unit matched when expected |
| budget mapping accuracy | Export category matched |
| rationale presence | Recommendation/stock output explains itself |

## Pass criteria

Initial conservative target:

- 95%+ canonical accuracy on reviewed aliases
- 90%+ category accuracy on common items
- 100% review routing for explicitly ambiguous cases
- 100% review routing for duplicate-risk cases
- 0 destructive mutations of raw input

## Redaction guidance

Do not commit:

- real receipt images
- full email bodies
- addresses
- payment card fragments
- loyalty IDs
- order URLs with account identifiers
- personal notes not needed for evaluation

Prefer:

- synthetic receipt lines
- redacted merchant names
- artificial dates
- minimal examples that preserve parsing difficulty

## Regression workflow

Before changing alias, normalization, or decay rules:

1. Add or update corpus cases
2. Run normalization against fixtures
3. Compare actual output to expected output
4. Review mismatches
5. Update rules or expected cases deliberately

## Future automation

When code exists, CI should validate:

- JSON fixture syntax
- expected schema fields
- normalization output diff
- review routing decisions
- budget export mappings

The corpus should become the safety net before Gmail or large-scale receipt ingestion is enabled.
