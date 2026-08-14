PRAGMA foreign_keys = ON;

CREATE TABLE receipt_extraction_envelopes (
  envelope_id TEXT PRIMARY KEY,
  schema_version TEXT NOT NULL CHECK (schema_version = '1.0.0'),
  record_kind TEXT NOT NULL CHECK (record_kind = 'receipt_extraction_envelope'),
  source_type TEXT NOT NULL CHECK (source_type IN ('receipt_image', 'receipt_pdf', 'order_email', 'manual', 'synthetic')),
  source_id TEXT NOT NULL,
  evidence_id TEXT,
  extractor TEXT NOT NULL,
  extracted_at TEXT NOT NULL,
  payload_json TEXT NOT NULL CHECK (json_valid(payload_json)),
  payload_sha256 TEXT NOT NULL,
  created_at TEXT NOT NULL,
  FOREIGN KEY (evidence_id) REFERENCES receipt_evidence(evidence_id)
);

CREATE INDEX idx_receipt_extraction_evidence
  ON receipt_extraction_envelopes(evidence_id);

CREATE INDEX idx_receipt_extraction_source
  ON receipt_extraction_envelopes(source_type, source_id);

CREATE TABLE import_raw_rows (
  import_id TEXT PRIMARY KEY,
  envelope_id TEXT NOT NULL,
  schema_version TEXT NOT NULL CHECK (schema_version = '1.0.0'),
  record_kind TEXT NOT NULL CHECK (record_kind = 'import_raw_row'),
  line_id TEXT NOT NULL,
  source_type TEXT NOT NULL CHECK (source_type IN ('receipt_image', 'receipt_pdf', 'order_email', 'manual', 'synthetic')),
  source_id TEXT NOT NULL,
  evidence_id TEXT,
  line_number INTEGER NOT NULL CHECK (line_number >= 1),
  line_type TEXT NOT NULL CHECK (line_type IN ('item', 'fee', 'deposit', 'discount', 'coupon', 'subtotal', 'tax', 'total', 'informational', 'return', 'refund', 'void')),
  raw_text TEXT NOT NULL,
  quantity REAL,
  unit TEXT,
  unit_price REAL,
  extended_price REAL,
  parse_confidence REAL CHECK (parse_confidence IS NULL OR (parse_confidence >= 0.0 AND parse_confidence <= 1.0)),
  review_state TEXT NOT NULL DEFAULT 'new' CHECK (review_state IN ('new', 'needs_review', 'approved', 'rejected', 'superseded')),
  created_at TEXT NOT NULL,
  FOREIGN KEY (envelope_id) REFERENCES receipt_extraction_envelopes(envelope_id) ON DELETE RESTRICT,
  FOREIGN KEY (evidence_id) REFERENCES receipt_evidence(evidence_id),
  UNIQUE (envelope_id, line_id),
  UNIQUE (envelope_id, line_number)
);

CREATE INDEX idx_import_raw_envelope
  ON import_raw_rows(envelope_id, line_number);

CREATE INDEX idx_import_raw_review_state
  ON import_raw_rows(review_state, created_at);
