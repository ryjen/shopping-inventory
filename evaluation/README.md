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

Run `npm run eval:semantic` to score the intentionally conservative exact-alias reference against the 100-case v3 corpus (`semantic-items.synthetic.jsonl`, `semantic-expansion.synthetic.jsonl`, `semantic-more-v3.synthetic.jsonl`) and invented 37-item `semantic-catalog-v3.synthetic.json` catalog. The command reports only aggregate results; it does not call a remote model or write to purchases, aliases, review events, stock, or the Worker. Required `npm test` also validates fixture shape, test-split membership, unknown/malformed provider responses and hard-policy vetoes. The corpus includes a synthetic retrieval-miss case where the true catalog item is intentionally absent from the supplied shortlist; the report separates shortlist recall from conditional selection accuracy. End-to-end outcomes, conditional selection (excluding retrieval failures and policy vetoes), and model behavior on unreachable-gold cases are reported separately. The current **v3 study has 100 materially synthetic identity cases**, 37 canonical catalog variants and 15 disjoint families (37 development, 26 validation, 37 test). New cases are in `semantic-more-v3.synthetic.jsonl` with the additive catalog `semantic-catalog-v3.synthetic.json`. The historical 50-case v2 study is preserved in its original files; its 17-case test snapshot and all original inputs are revalidated before any v3 scoring. `semantic-split-v3.synthetic.json` freezes all 37 v3 test cases. Family labels, test gold, and public catalog shortlists are visible by design. This is a public held-out **case-family** comparison, not a blind unseen-product benchmark, not a calibrated study, and not evidence of production safety. Do not tune prompts or thresholds using held-out gold. #4 remains open for distinct receipt/quantity, duplicate/reprocessing, budget, stock, and review-routing fixture families.

`npm run eval:semantic -- --replay` compares exact alias matching to ten **invented scripted responses**, saved in `semantic-scripted-replay.synthetic.json`, on exactly the same cases. Replay verifies full raw-line, hard-flag and candidate-order bindings and exercises mechanical multiclass Brier scoring on eligible cases only. It is not Jev inference, local inference, training, or evidence of a model's capabilities. Both modes emit aggregate JSON only and require no credentials/network.

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
