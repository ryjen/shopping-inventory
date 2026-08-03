# Private Data Policy

## Purpose

This public repository contains the software, schemas, migrations, documentation, and synthetic fixtures for Shopping Inventory. It is not an approved storage location for real household data.

Real shopping data can reveal location, routines, spending, diet, health-adjacent purchases, household composition, pet ownership, and other personal patterns even when obvious identifiers are removed.

## Storage boundary

| Data | Approved storage | Public repository |
| --- | --- | --- |
| Source code, migrations, schemas, documentation | GitHub | Allowed |
| Synthetic fixtures and generated test data | GitHub | Allowed |
| Real receipt images and source files | Private Cloudflare R2 | Prohibited |
| Real OCR or extraction payloads | Private R2 or D1, according to size and replay needs | Prohibited |
| Purchase ledger, review state, stock, aliases, and budget output | Private Cloudflare D1 | Prohibited |
| Credentials, resource identifiers, and access tokens | Cloudflare secrets or ignored private configuration | Prohibited |
| Local development data | Ignored, encrypted local paths | Prohibited |
| Google Sheets exports | Private, optional reporting/review surface | Prohibited |

Cloudflare D1 is the preferred authoritative structured datastore. Cloudflare R2 is the preferred private evidence store. Access is mediated through an authenticated Worker. Buckets and databases must not be exposed directly.

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

Deletion must cover both the R2 object and its D1 metadata or tombstone state. Backups and exports must follow the same private-storage requirements.

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

If private data or credentials are committed:

1. stop further distribution and close or block the affected pull request;
2. revoke or rotate exposed credentials and source links;
3. identify all branches, tags, artifacts, forks, and clones that may contain the data;
4. migrate any required data to approved private storage;
5. remove the data and decide whether Git history rewriting is necessary;
6. document the incident without reproducing the private payload;
7. add a regression check when practical.
