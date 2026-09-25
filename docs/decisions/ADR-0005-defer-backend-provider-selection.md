# ADR-0005: Defer Backend Provider Selection

## Status

Superseded by [ADR-0006: Public code with private Cloudflare operating substrate](ADR-0006-public-code-private-cloudflare-substrate.md).

## Historical decision

This ADR originally deferred backend selection while the project was spreadsheet-first and requirements were still being discovered. It favored portability and suggested SQLite/PocketBase as possible next steps if Sheets became limiting.

That context is preserved for history, but it is no longer authoritative. Privacy requirements and implementation evidence have since established Cloudflare Worker + D1 + R2 as the preferred private operating substrate while retaining SQLite-compatible portability and optional Sheets/CSV export surfaces.

Do not use this ADR to justify a parallel authoritative datastore or a return to spreadsheet-first storage.
