# Private Google Workspace receipt intake

## Explain it to a human
Put real receipts in the private Drive folder, add their transaction rows to the private Sheet, and never paste the data into GitHub.

## Procedure
1. Open the owner-restricted **Shopping Inventory — Private Data** Drive folder. Do not store its ID or its URL in a public repository, CI variable, log, issue, or PR.
2. Upload source receipt images and PDFs to its restricted **Original Receipts** folder. Do not enable `anyone with the link` sharing.
3. Open the owner-restricted **Shopping Inventory — Private Receipt Ledger** Google Sheet and verify `Receipts`, `Line Items`, and `Instructions` tabs.
4. Use one opaque `receipt_id` for each receipt and one stable `line_id` for each item; write the private Drive file ID to `Receipts.drive_file_id`.
5. Enter date/time, merchant, totals, currency and normalized items; exclude payment card fragments, loyalty numbers, personal contact information, and unneeded location identifiers.
6. Treat new/needs_review rows as untrusted extraction staging. Human review in this Sheet does **not** bypass the canonical purchase promotion authority.
7. Keep edit access owner-only; periodically inspect both folder and file-level permissions including inherited shares.
8. Periodically export a private backup and verify a restore with synthetic data. Retention/deletion requires handling both the Sheet records and evidence file.

## Privacy / failure policy
- No private account, Drive ID, Sheet ID, credentials, transaction details, or real receipt data in public Git/CI/PRs/issues.
- Never use a Git branch or a Sheets formula that fetches private remote URLs as a transport mechanism.
- If the folder/Sheet is shared beyond the owner or an ID leaks, suspend ingestion, revoke the sharing scope, and reassess links and credentials.
- A Sheet is not immutable or transactional: manual corrections must preserve traceability and future migration must detect duplicates and reconcile IDs.
- Automated promotion or import into production D1/R2 requires a separate, approved cutover and provider-specific security verification.

See [ADR-0008](../decisions/ADR-0008-private-google-workspace-receipt-intake.md) and [Private Data Policy](../security/private-data-policy.md).
