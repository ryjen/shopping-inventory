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

## Semantic model evaluations

[Semantic normalization evaluation](../docs/specs/semantic-normalization-evaluation.md) defines a proposed provider-neutral, synthetic-only benchmark for optional Jev and local decision models (tracked in [#42](https://github.com/ryjen/shopping-inventory/issues/42)). It does **not** make model calls part of required CI or allow model decisions to approve purchases. Synthetic fixture expansion remains owned by [#4](https://github.com/ryjen/shopping-inventory/issues/4).

## Offline semantic baseline (first slice of #4/#42)

Run `npm run eval:semantic` to score the intentionally conservative exact-alias reference against the independent, materially synthetic `semantic-catalog.synthetic.json` and `semantic-items.synthetic.jsonl` fixtures. The command reports only aggregate results; it does not call a remote model or write to purchases, aliases, review events, stock, or the Worker. Required `npm test` also validates fixture shape, test-split membership, unknown/malformed provider responses and hard-policy vetoes. The corpus includes a synthetic retrieval-miss case where the true catalog item is intentionally absent from the supplied shortlist; the report separates shortlist recall from conditional selection accuracy. End-to-end outcomes, conditional selection (excluding retrieval failures and policy vetoes), and model behavior on unreachable-gold cases are reported separately. This initial small corpus is **not** a calibrated or statistically adequate performance evaluation and must not justify automatic normalization.

## Principles

- Public fixtures are synthetic, not merely redacted
- `.synthetic.*` structured records declare `synthetic: true` in content; CSV fixtures carry a `synthetic` column
- Invent identifiers, merchants, dates, baskets, and totals
- Preserve parsing difficulty without preserving a real transaction
- Use only the minimum fields needed by the test
- Ambiguous cases should route to review
- Raw evidence should not be destructively rewritten
- Expected outputs should include rationale when relevant
- Real data belongs only in approved private storage
