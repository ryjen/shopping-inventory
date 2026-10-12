# Integration Credentials and OAuth Scope Boundary

## Purpose

External integrations are transport/orchestration clients. They do not own authoritative Shopping Inventory state and should receive only the access needed to discover or transport evidence.

The checked-in n8n Gmail → Sheets workflow is a transitional synthetic/test fixture. New real-data integrations must target the authenticated Worker/private D1 staging boundary.

## Gmail

The transitional workflow only searches and reads messages. It does not modify, label, send, archive, or delete mail.

Minimum intended Gmail scope:

- `https://www.googleapis.com/auth/gmail.readonly`

Do not grant `gmail.modify`, compose/send, settings, or full `mail.google.com` access for this workflow.

Use bounded search queries and a dedicated integration identity/account where practical. Production mailbox credentials must never be exported into Git or public CI.

## Google Sheets

The transitional workflow only appends rows to a dedicated non-authoritative Sheet.

Minimum intended Sheets access:

- `https://www.googleapis.com/auth/spreadsheets` for append/update access by known spreadsheet ID.

If the n8n credential flow requires Drive-backed file selection, prefer `https://www.googleapis.com/auth/drive.file` over full Drive access and restrict the account to the dedicated integration file. Do not grant broad `drive` access merely for convenience.

Real household data must not use the checked-in legacy Sheets destination. Sheets remain optional private review/export surfaces under ADR-0006.

## Worker API credential

n8n or another ingestion client calling the Worker should use a dedicated secret/token that:

- is stored only in the integration secret store and Worker secret configuration;
- is not embedded in workflow JSON, URLs, issue text, or CI configuration;
- has a distinct identity from human/admin credentials where the authorization model permits it;
- can be rotated without changing canonical data identifiers;
- is revoked immediately after suspected disclosure.

The current single bearer-token Worker boundary is acceptable for the single-client/private milestone. Multi-client operation should introduce scoped/short-lived authorization before expanding trust.

## n8n credential storage

- keep Google OAuth and Worker credentials in n8n's credential store;
- protect the n8n encryption key as a secret and back it up only with the encrypted credential database;
- never export decrypted credentials with workflow JSON;
- public workflow exports must contain placeholders only;
- avoid raw Gmail bodies, receipt payloads, tokens, or private resource IDs in execution logs.

The CI `N8N_ENCRYPTION_KEY` is synthetic test-only material and is not a production secret.

## Rotation

Rotate an integration credential when:

- a token/key is committed, logged, pasted into a public surface, or otherwise disclosed;
- an operator/integration no longer requires access;
- provider security guidance or account ownership changes require rotation.

After rotation:

1. update the private credential store;
2. validate the integration against synthetic/private test data;
3. revoke the previous credential;
4. confirm public repository/workflow exports remain placeholder-only;
5. document only opaque incident/change references.

See [Public Data Incident Response](../runbooks/public-data-incident-response.md) for disclosure handling.
