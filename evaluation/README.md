# Evaluation Fixtures

This directory contains synthetic and redacted fixtures for testing OCR extraction, normalization, aliasing, review routing, stock decay, and budget export behavior.

Do not commit real receipt images, full email bodies, addresses, payment card fragments, account identifiers, loyalty IDs, or private order URLs.

## Structure

```text
evaluation/
  fixtures/
    receipt-lines.synthetic.jsonl
    order-lines.synthetic.jsonl
    aliases.synthetic.csv
  expected/
    normalized-purchases.synthetic.jsonl
    review-queue.synthetic.jsonl
```

## Workflow

1. Add a fixture case that captures a parsing or normalization behavior
2. Add the expected normalized purchase or review queue decision
3. Run the future normalization pipeline against fixtures
4. Compare actual output to expected output
5. Update rules or fixtures deliberately

## Principles

- Prefer synthetic examples
- Preserve parsing difficulty without preserving private data
- Ambiguous cases should route to review
- Raw evidence should not be destructively rewritten
- Expected outputs should include rationale when relevant
