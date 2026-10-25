# ADR-0008: Private Google Workspace manual receipt intake

## Status
Accepted for interim manual intake; does not supersede ADR-0006's canonical production architecture.

## Explain it to a human
Keep code public, but receipts private. Photos go in a private Drive folder and manually entered receipt and line-item records go in a private Sheet. Git gets synthetic fixtures only.

## Context
Cloudflare Worker/D1/R2 code is implemented, but the private production resources have not been provisioned. Storing real receipts temporarily in public Git or pull requests is prohibited. The owner needs a simple private operational destination now.

## Decision
- Original evidence (photo/PDF) lives in an owner-restricted Google Drive folder.
- Manual extracted records are staged in an owner-restricted Google Sheet with `Receipts` and `Line Items` tabs, joined by opaque `receipt_id`.
- The Sheet records a restricted Drive file ID as a reference, never embedded public evidence URLs.
- The Sheet is **manual staging**, not an authoritative purchase-promotion engine. Review status in the Sheet is not an immutable canonical purchase event.
- Neither the Sheet/Drive identifiers, links, nor data enter public Git, CI, issues, logs, examples, or exports.
- Automation and AI do not get broad Google Drive/Sheets write scopes by default; future integration must establish scoped authorization and validation.
- No automatic dual-write to Cloudflare. A future cutover must reconcile receipts and rows, validate backups, establish the canonical review boundary, and explicitly switch authority.

## Consequences and controls
- Advantages: immediately private, owner-manageable, low operating cost, human-readable, easy CSV export.
- Limitations: accidental sharing, mutable rows, weak relational constraints, quotas, accidental row deletion, no atomic evidence/ledger transaction, and weaker event auditability.
- Guardrails: owner-only sharing verification, minimal identifiers, consistent opaque IDs, input validation, private versioning/backups, periodic export, and synthetic-only CI.
- Future canonical backend remains the authenticated Worker backed by D1 and R2 per ADR-0006; this is not approval to bypass domain promotion rules.

See [Google Workspace private receipt intake runbook](../runbooks/google-workspace-receipt-intake.md).
