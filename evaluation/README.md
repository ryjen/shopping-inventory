# Evaluation Fixtures

This directory contains synthetic fixtures for testing OCR extraction, normalization, aliasing, review routing, stock decay, and budget export behavior.

Public fixtures must be synthetic. Removing a few identifiers from a real transaction is not sufficient for publication.

See [Private Data Policy](../docs/security/private-data-policy.md).

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

1. Create a synthetic fixture for the target behavior
2. Add the expected normalized purchase or review queue decision
3. Run the normalization pipeline against fixtures
4. Compare actual output to expected output
5. Update rules or fixtures deliberately

## Principles

- Public fixtures are synthetic, not merely redacted
- Invent identifiers, merchants, dates, baskets, and totals
- Preserve parsing difficulty without preserving a real transaction
- Use only the minimum fields needed by the test
- Ambiguous cases should route to review
- Raw evidence should not be destructively rewritten
- Expected outputs should include rationale when relevant
- Real data belongs only in approved private storage
