PRAGMA foreign_keys = ON;

-- Composite parent keys let child tables prove semantic provenance through
-- ordinary SQLite/D1 foreign keys instead of relying on application discipline.
CREATE UNIQUE INDEX idx_import_raw_id_line_type
  ON import_raw_rows(import_id, line_type);

CREATE TABLE purchase_candidates (
  candidate_id TEXT PRIMARY KEY,
  schema_version TEXT NOT NULL DEFAULT '1.0.0' CHECK (schema_version = '1.0.0'),
  record_kind TEXT NOT NULL DEFAULT 'purchase_candidate' CHECK (record_kind = 'purchase_candidate'),
  source_import_id TEXT NOT NULL,
  source_line_type TEXT NOT NULL DEFAULT 'item' CHECK (source_line_type = 'item'),
  canonical_item_id TEXT NOT NULL CHECK (length(canonical_item_id) > 0),
  quantity REAL NOT NULL CHECK (quantity > 0),
  unit TEXT,
  amount REAL CHECK (
    amount IS NULL OR abs((amount * 100.0) - round(amount * 100.0)) < 0.000001
  ),
  normalization_confidence REAL CHECK (
    normalization_confidence IS NULL OR
    (normalization_confidence >= 0.0 AND normalization_confidence <= 1.0)
  ),
  review_state TEXT NOT NULL CHECK (review_state IN ('needs_review', 'approved', 'rejected')),
  created_at TEXT NOT NULL,
  FOREIGN KEY (source_import_id, source_line_type)
    REFERENCES import_raw_rows(import_id, line_type)
    ON UPDATE RESTRICT
    ON DELETE RESTRICT,
  UNIQUE (candidate_id, review_state)
);

CREATE INDEX idx_purchase_candidates_source_import
  ON purchase_candidates(source_import_id);

CREATE INDEX idx_purchase_candidates_review_state
  ON purchase_candidates(review_state, created_at);

CREATE TABLE purchases (
  purchase_id TEXT PRIMARY KEY,
  schema_version TEXT NOT NULL DEFAULT '1.0.0' CHECK (schema_version = '1.0.0'),
  record_kind TEXT NOT NULL DEFAULT 'purchase' CHECK (record_kind = 'purchase'),
  source_candidate_id TEXT NOT NULL UNIQUE,
  source_review_state TEXT NOT NULL DEFAULT 'approved' CHECK (source_review_state = 'approved'),
  canonical_item_id TEXT NOT NULL CHECK (length(canonical_item_id) > 0),
  quantity REAL NOT NULL CHECK (quantity > 0),
  unit TEXT,
  amount REAL CHECK (
    amount IS NULL OR abs((amount * 100.0) - round(amount * 100.0)) < 0.000001
  ),
  acquired_at TEXT,
  supersedes_id TEXT UNIQUE,
  created_at TEXT NOT NULL,
  CHECK (supersedes_id IS NULL OR supersedes_id <> purchase_id),
  FOREIGN KEY (source_candidate_id, source_review_state)
    REFERENCES purchase_candidates(candidate_id, review_state)
    ON UPDATE RESTRICT
    ON DELETE RESTRICT,
  FOREIGN KEY (supersedes_id)
    REFERENCES purchases(purchase_id)
    ON UPDATE RESTRICT
    ON DELETE RESTRICT
);

CREATE INDEX idx_purchases_canonical_item
  ON purchases(canonical_item_id, acquired_at);
