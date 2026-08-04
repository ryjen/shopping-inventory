PRAGMA foreign_keys = ON;

CREATE TABLE receipt_evidence (
  evidence_id TEXT PRIMARY KEY,
  receipt_id TEXT NOT NULL,
  schema_version INTEGER NOT NULL DEFAULT 1 CHECK (schema_version >= 1),
  record_kind TEXT NOT NULL DEFAULT 'receipt_evidence' CHECK (record_kind = 'receipt_evidence'),
  object_key TEXT NOT NULL UNIQUE,
  content_type TEXT NOT NULL,
  byte_length INTEGER NOT NULL CHECK (byte_length >= 0),
  source_sha256 TEXT,
  created_at TEXT NOT NULL,
  deleted_at TEXT
);

CREATE INDEX idx_receipt_evidence_receipt_id ON receipt_evidence(receipt_id);

CREATE TABLE audit_events (
  event_id TEXT PRIMARY KEY,
  actor_id TEXT NOT NULL,
  action TEXT NOT NULL,
  target_kind TEXT NOT NULL,
  target_id TEXT NOT NULL,
  occurred_at TEXT NOT NULL,
  metadata_json TEXT NOT NULL DEFAULT '{}' CHECK (json_valid(metadata_json))
);

CREATE INDEX idx_audit_events_target ON audit_events(target_kind, target_id, occurred_at);
