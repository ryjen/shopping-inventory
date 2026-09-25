PRAGMA foreign_keys = ON;

-- Exact binary identity is safe to treat as evidence idempotency. Soft-deleted
-- evidence no longer owns the hash, allowing an intentionally deleted object to
-- be re-ingested later without retaining a hidden active reference.
CREATE UNIQUE INDEX idx_receipt_evidence_active_source_sha256
  ON receipt_evidence(source_sha256)
  WHERE source_sha256 IS NOT NULL
    AND deleted_at IS NULL;
