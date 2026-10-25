# Private Data Policy

## Purpose

This public repository contains the software, schemas, migrations, documentation, and synthetic fixtures for Shopping Inventory. It is not an approved storage location for real household data.

Real shopping data can reveal location, routines, spending, diet, health-adjacent purchases, household composition, pet ownership, and other personal patterns even when obvious identifiers are removed.

## Storage boundary

| Data | Approved storage | Public repository |
| --- | --- | --- |
| Source code, migrations, schemas, documentation | GitHub | Allowed |
| Synthetic fixtures and generated test data | GitHub | Allowed |
| Real receipt images and source files | Restricted Google Drive (current manual intake); private R2 (future service) | Prohibited |
| Real OCR or extraction payloads | Restricted Google Drive/Sheet only for manual staging; private R2/D1 after service cutover | Prohibited |
| Manual receipt ledger and extracted lines | Owner-restricted Google Sheet (current manual intake) | Prohibited |
| Canonical authoritative purchases, review events, and derived state | Private Cloudflare D1 once deployed | Prohibited |
| Credentials, private resource identifiers, and access tokens | Private secrets/configuration only | Prohibited |
| Local development data | Ignored, encrypted local paths | Prohibited |
| Google Sheets exports | Private only | Prohibited |

The owner-restricted Drive folder and Sheet are the current **manually controlled receipt intake destination**; they are not a replacement for canonical review/promotion transactions. Cloudflare D1/R2 and the authenticated Worker remain the planned application substrate. Never dual-write real receipts without an explicit reviewed migration/cutover. Do not publish private Drive/Sheet IDs or links in code, docs, issues, CI or logs. See [ADR-0008](../decisions/ADR-0008-private-google-workspace-receipt-intake.md).

## Public fixture requirements

Public fixtures must be synthetic. Redacting a real receipt is not sufficient because the combination of merchant, branch, timestamp, basket, prices, payment method, loyalty program, and recurring patterns may remain identifying.

Synthetic fixtures must:

- use invented identifiers and source references;
- avoid real receipt images or verbatim real baskets;
- avoid real store branches, household locations, loyalty identifiers, payment details, order IDs, email addresses, and private URLs;
- avoid exact combinations of date, merchant, basket, and totals copied from real transactions;
- contain only the minimum fields needed to exercise a test or document a contract;
- be clearly marked as synthetic in the fixture or containing directory.

Transforming a real receipt by removing one or two fields does not make it an acceptable public fixture. A fixture derived from real data must be materially regenerated so that it cannot reasonably be linked back to the transaction.

## Prohibited public fields

The following must never be committed when they refer to real activity:

- receipt or order images;
- raw OCR or email bodies;
- exact purchase timestamps;
- store addresses or neighbourhood-specific branches;
- payment method details or card fragments;
- loyalty identifiers or membership numbers;
- order, delivery, invoice, or tax-registration identifiers;
- personal email addresses, phone numbers, or private URLs;
- real household product baskets and recurring purchase histories;
- pharmacy, health-adjacent, financial, or other sensitive purchase information;
- production Cloudflare resource IDs, secrets, tokens, or private configuration.

## Local development

Local and CI execution use synthetic data by default. Private local data belongs only in ignored paths such as `.private/`, `data/private/`, `receipts/private/`, or `exports/private/`.

Private local files should be encrypted at rest when retained. Test and development commands must not contact production resources unless an operator explicitly selects a production configuration.

## Retention

Receipt images should be retained only as long as they are needed for extraction, review, dispute resolution, or audit. Structured purchase history may be retained longer when it serves the inventory or budgeting workflow.

Deletion of manually staged data must cover the private Drive file, the corresponding private Sheet rows, trash and retained copies as appropriate; once the Worker substrate is deployed, it must cover both R2 and D1 records. Backups and exports must follow the same private-storage requirements.

## Contribution gate

Before merging a fixture or example, confirm:

- the data is synthetic;
- no private identifiers or source references are present;
- no real household basket can be reconstructed;
- the fixture is minimal for its test purpose;
- automated privacy and schema checks pass.

When uncertain, do not commit the data. Store it privately and create a new synthetic fixture.

## Existing data

Issue #10 tracks the audit and remediation of receipt-derived data already present in repository history, branches, pull requests, and artifacts. Removing a file in a new commit does not remove it from Git history.

## Incident response

Use the [Public Data Incident Response runbook](../runbooks/public-data-incident-response.md) for containment, scope analysis, credential rotation, Git-history decisions, artifact cleanup, and regression evidence.

Security findings must be reported through the private path in [SECURITY.md](../../SECURITY.md). Do not reproduce sensitive payloads in public issues, pull requests, or comments.
