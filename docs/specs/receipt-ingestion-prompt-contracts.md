# Receipt Ingestion Prompt Contracts

This document defines the expected contract for AI-assisted receipt extraction. It is written for ChatGPT-style manual extraction first, but the structure should also work for future API or workflow automation.

## Goals

- Extract receipt lines into structured rows
- Preserve uncertainty and raw evidence
- Avoid inventing missing values
- Produce outputs that can be appended to `Import_Raw`
- Make review and replay possible

## Non-goals

- Do not estimate current inventory
- Do not silently normalize into authoritative purchases
- Do not infer nutrition facts
- Do not discard ambiguous lines
- Do not mutate existing spreadsheet state without explicit approval

## Input contract

A receipt ingestion prompt should provide:

- receipt image or OCR text
- optional merchant hint
- optional purchase date hint
- expected currency, usually `CAD`
- target output format
- instruction to preserve uncertainty

## Output contract

The model should return JSON compatible with `Import_Raw`.

```json
{
  "receipt": {
    "receipt_id": "string",
    "merchant_raw": "string|null",
    "merchant_normalized": "string|null",
    "purchased_at_raw": "string|null",
    "purchased_at": "ISO-8601|null",
    "currency": "CAD",
    "receipt_total_raw": "string|null",
    "receipt_total_amount": "number|null",
    "confidence": 0.0,
    "ambiguity_notes": ["string"]
  },
  "lines": [
    {
      "line_number": 1,
      "raw_line_text": "string",
      "item_text_raw": "string|null",
      "quantity_raw": "string|null",
      "unit_raw": "string|null",
      "price_raw": "string|null",
      "price_amount": 0.0,
      "tax_raw": "string|null",
      "discount_raw": "string|null",
      "ocr_confidence": 0.0,
      "parse_confidence": 0.0,
      "ambiguity_notes": ["string"]
    }
  ]
}
```

## Prompt template

```text
You are extracting grocery/household receipt data for an append-only import sheet.

Rules:
- Treat the receipt as evidence, not inventory truth.
- Do not invent missing values.
- Preserve raw text whenever possible.
- Use null for unknown structured values.
- Keep ambiguous lines and explain uncertainty.
- Do not normalize into canonical item names unless explicitly visible.
- Do not estimate current stock.
- Do not remove possible duplicates.
- Return JSON only.

Extract:
- merchant_raw
- merchant_normalized if obvious
- purchased_at_raw
- purchased_at as ISO-8601 if obvious
- receipt_total_raw and amount if visible
- each purchased line item with raw line text, item text, quantity, unit, price, tax/discount markers, confidence, and ambiguity notes

Currency default: CAD.
Output must follow this schema:
[paste JSON contract]
```

## Spreadsheet append contract

Each extracted `lines[]` entry maps to one `Import_Raw` row.

Generated fields during append:

| Field | Generation rule |
| --- | --- |
| `import_id` | Deterministic or generated UUID per line |
| `receipt_id` | From output receipt object or generated UUID |
| `source_type` | `receipt_photo` |
| `source_uri` | Optional file/image reference |
| `extractor` | Tool/model/workflow name |
| `extracted_at` | Current timestamp |
| `review_state` | `new` |

## Confidence guidance

Confidence should be conservative.

| Situation | Confidence guidance |
| --- | --- |
| Clear printed line and price | High |
| Abbreviated but readable item | Medium-high |
| Smudged/partial text | Low-medium |
| Multiple possible item names | Low |
| Inferred value not directly visible | Use null instead |

## Refusal / escalation cases

The extractor should ask for manual review or return low confidence when:

- receipt image is unreadable
- totals do not reconcile
- item names are ambiguous
- quantities are unclear
- multiple receipts appear in one image
- personal/pharmacy items appear sensitive

## Example output fragment

```json
{
  "receipt": {
    "receipt_id": "rcpt_2026_05_27_example_001",
    "merchant_raw": "SAVE-ON-FOODS",
    "merchant_normalized": "Save-On-Foods",
    "purchased_at_raw": "2026/05/27 18:42",
    "purchased_at": "2026-05-27T18:42:00-07:00",
    "currency": "CAD",
    "receipt_total_raw": "$42.17",
    "receipt_total_amount": 42.17,
    "confidence": 0.92,
    "ambiguity_notes": []
  },
  "lines": [
    {
      "line_number": 1,
      "raw_line_text": "BNNAS 1.23KG 2.69",
      "item_text_raw": "BNNAS",
      "quantity_raw": "1.23KG",
      "unit_raw": "KG",
      "price_raw": "2.69",
      "price_amount": 2.69,
      "tax_raw": null,
      "discount_raw": null,
      "ocr_confidence": 0.91,
      "parse_confidence": 0.86,
      "ambiguity_notes": ["Item appears to be bananas but raw text is abbreviated"]
    }
  ]
}
```

## Review boundary

Receipt extraction output is not allowed to directly update `Purchases` or `Stock`. It should append to `Import_Raw` and allow the normalization pipeline to promote reviewed rows.
