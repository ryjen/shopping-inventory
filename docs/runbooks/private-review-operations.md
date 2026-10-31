# Private receipt review API — operator guide

## Release boundary

This is an authenticated **owner-operated API**, not a public web application. A private, separately stored `OWNER_TOKEN` authorizes all review and purchase endpoints. Ingestion automation holds only `API_TOKEN`, which **cannot** approve acquisitions or read owner queues. If both token values are the same, the owner endpoints reject requests (fail closed). Both values are Cloudflare Worker secrets, never public TOML, Git, CI or shell history.

The Worker verifies the bearer token **before any database query**. All responses use `Cache-Control: private, no-store`. Raw receipt/line text is private. Caller must protect the HTTP client, local terminal output, tokens, and backups.

## Request flow

1. Ingest an image or source evidence at `POST /v1/receipts`, followed by canonical extraction at `POST /v1/receipt-extractions`. Both steps stage evidence only.
2. `GET /v1/review/raw?limit=30`: pending raw rows, with opaque IDs, line text, review state/version, and owning envelope duplicate state.
3. `GET /v1/review/duplicates?limit=30`: unresolved collision queue. `GET /v1/review/duplicates/{envelopeId}/peers` gives bounded same-fingerprint transaction summaries for comparison. Compare evidence before selecting `distinct` or `confirmed_duplicate`.
4. `POST /v1/review/duplicates/{envelopeId}` with `{"expectedVersion":0,"decision":"distinct"}`, or `confirmed_duplicate` if supported by inspection. Unresolved/confirmed duplicate transactions cannot promote.
5. `POST /v1/review/raw/{importId}` with `{"expectedVersion":0,"decision":"approved"}` or `rejected` for each raw row. Non-item lines must not be promoted to purchases; database constraints prohibit it.
6. `POST /v1/purchase-candidates` with `{"sourceImportId":"<opaque-id>","canonicalItemId":"synthetic_oats","quantity":1,"unit":"each","amount":5.50}` to explicitly propose an interpretation of an approved item. This creates `needs_review`, never an approved purchase.
7. `GET /v1/review/candidates?limit=30` then `POST /v1/review/candidates/{candidateId}` with `{"expectedVersion":0,"decision":"approved"}` or `rejected`.
8. `POST /v1/purchases` with `{"candidateId":"<opaque-id>"}` to promote an approved candidate. An optional `supersedesId` is required when replacing an existing purchase from the same raw source. Existing matching promotions return an idempotent result.
9. `GET /v1/purchases?limit=30` lists current authoritative acquisitions (excluding superseded versions). Stock, budget and shopping recommendations remain recomputable separately.

`expectedVersion` is optimistic concurrency control. Use the current version returned by the queue; a stale review returns 409. Invalid decisions return 422. Storage failures return 503. Queue limits are capped at 100 items; pagination beyond this MVP requires a separate reviewed implementation. All writes also rely on append-only review/duplicate events, DB-enforced source item semantics, duplicate blocking, immutable purchases, and mandatory actor attribution.

## Private client example

From a trusted operator terminal, read the token from your password manager into an unexported protected environment variable. Never print it, supply it literally in terminal command history, or save it to shell configuration.

```sh
# Set SHOPPING_OWNER_TOKEN privately before use, not in the command itself.
curl --fail-with-body --silent --show-error \
  -H "Authorization: Bearer ${SHOPPING_OWNER_TOKEN:?required}" \
  -H 'Accept: application/json' \
  "${SHOPPING_API_URL:?required}/v1/review/raw?limit=30"
```

The output contains private data. Keep it off shared terminals, CI, public tickets and screenshots. Do not enable `curl -v` or shell tracing with tokens present.

## Known limitations and production gates

- There is **no browser UI**, retailer connector, OCR engine, or automatic normalization/promotion in this change.
- The current owner identity is the single `OWNER_TOKEN` principal (`owner_api_token`), not a multi-user identity provider. Do not expose this service to multiple household members or automation carrying owner credentials.
- Deploy only after private Worker/D1/R2 resource and billing authorization, both secrets provisioned distinctly, controlled route and abuse/rate protections, synthetic live authorization/rollback tests, backup/restore qualification and explicit private-data cutover.
- Real receipts stored in owner-only Google Drive/Sheets remain **manual staging**. No automatic dual write or Git transport is permitted.
- This API does not make inferred physical stock authoritative. A purchase is evidence of acquisition, not current possession.
