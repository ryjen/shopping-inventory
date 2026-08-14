# Agent execution boundary

This repository is public. Treat every real receipt, order, purchase record, OCR/extraction payload, stock state, budget record, household identifier, and user-supplied shopping datum as **private input**.

## Hard rule: private data never enters Git

Agents and automations must not create or update a Git branch, commit, pull request, issue attachment, workflow artifact, fixture, example, or comment with real receipt-derived or household data, even temporarily.

This rule applies before repository mutation. CI is defense in depth; a public branch containing private data is already a privacy failure even if a later check rejects it.

When handling real data:

1. Send receipt evidence only to the authenticated private Worker / D1 / R2 path defined by the project.
2. If the private service is unavailable, use an ignored encrypted local path such as `.private/`; do not use Git as a queue or fallback datastore.
3. If a regression fixture is needed, construct a materially synthetic case before any GitHub mutation. Invent the merchant, identifiers, timestamp, basket, quantities, prices, and totals while preserving only the structural parsing problem.
4. Never copy a real payload into a prompt-authored repository file merely to test the privacy scanner.
5. Before publishing repository changes, run `npm run privacy:check` and the relevant tests.

## Repository-safe evidence

Public repository content may include:

- code, schemas, migrations, and documentation;
- synthetic fixtures under `evaluation/fixtures/` or `test/fixtures/`;
- incident descriptions that identify the exposure class and remediation without reproducing private values.

Do not treat redaction of a real transaction as sufficient syntheticization.

## Authority boundaries

- Raw evidence is evidence, not authoritative purchase state.
- AI/extraction output proposes interpretations; it does not silently promote authoritative purchases.
- Purchases are authoritative only after the defined review/promotion boundary.
- Stock, budget exports, and recommendations are derived and recomputable.

See `docs/security/private-data-policy.md` and `docs/runbooks/private-receipt-storage.md` for the durable policy and operating procedure.
