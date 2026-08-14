PRAGMA foreign_keys = ON;

DELETE FROM purchases WHERE purchase_id LIKE 'pur_syn_rel_%';
DELETE FROM purchase_candidates WHERE candidate_id LIKE 'cand_syn_rel_%';
DELETE FROM import_raw_rows WHERE envelope_id = 'env_syn_rel_positive';
DELETE FROM receipt_extraction_envelopes WHERE envelope_id = 'env_syn_rel_positive';

INSERT INTO receipt_extraction_envelopes
  (envelope_id, schema_version, record_kind, source_type, source_id, evidence_id, extractor, extracted_at, payload_json, payload_sha256, created_at)
VALUES
  ('env_syn_rel_positive', '1.0.0', 'receipt_extraction_envelope', 'synthetic', 'src_syn_rel_positive', NULL, 'relational-smoke', '2026-01-15T18:00:00Z', '{"synthetic":true}', 'sha256-rel-positive', '2026-01-15T18:00:01Z');

INSERT INTO import_raw_rows
  (import_id, envelope_id, schema_version, record_kind, line_id, source_type, source_id, evidence_id, line_number, line_type, raw_text, quantity, unit, unit_price, extended_price, parse_confidence, review_state, created_at)
VALUES
  ('imp_syn_rel_item', 'env_syn_rel_positive', '1.0.0', 'import_raw_row', 'line_syn_rel_item', 'synthetic', 'src_syn_rel_positive', NULL, 1, 'item', 'SYNTHETIC ITEM', 1, 'each', 4.00, 4.00, 0.99, 'new', '2026-01-15T18:00:01Z');

INSERT INTO purchase_candidates
  (candidate_id, source_import_id, source_line_type, canonical_item_id, quantity, unit, amount, normalization_confidence, review_state, created_at)
VALUES
  ('cand_syn_rel_primary', 'imp_syn_rel_item', 'item', 'item_syn_rel', 1, 'each', 4.00, 0.98, 'needs_review', '2026-01-15T18:01:00Z');

UPDATE purchase_candidates
SET review_state = 'approved'
WHERE candidate_id = 'cand_syn_rel_primary';

INSERT INTO purchases
  (purchase_id, source_candidate_id, source_review_state, canonical_item_id, quantity, unit, amount, acquired_at, supersedes_id, created_at)
VALUES
  ('pur_syn_rel_primary', 'cand_syn_rel_primary', 'approved', 'item_syn_rel', 1, 'each', 4.00, '2026-01-15T10:00:00Z', NULL, '2026-01-15T18:02:00Z');

-- Duplicate promotion of the same candidate is ignored by the unique source key.
INSERT OR IGNORE INTO purchases
  (purchase_id, source_candidate_id, source_review_state, canonical_item_id, quantity, unit, amount, acquired_at, supersedes_id, created_at)
VALUES
  ('pur_syn_rel_duplicate', 'cand_syn_rel_primary', 'approved', 'item_syn_rel', 1, 'each', 4.00, '2026-01-15T10:00:00Z', NULL, '2026-01-15T18:02:01Z');

SELECT CASE
  WHEN (SELECT COUNT(*) FROM purchases WHERE source_candidate_id = 'cand_syn_rel_primary') = 1 THEN 1
  ELSE json_extract('invalid-json', '$')
END AS duplicate_promotion_guard_ok;

-- Create one correction purchase that supersedes the original.
INSERT INTO import_raw_rows
  (import_id, envelope_id, schema_version, record_kind, line_id, source_type, source_id, evidence_id, line_number, line_type, raw_text, quantity, unit, unit_price, extended_price, parse_confidence, review_state, created_at)
VALUES
  ('imp_syn_rel_correction', 'env_syn_rel_positive', '1.0.0', 'import_raw_row', 'line_syn_rel_correction', 'synthetic', 'src_syn_rel_positive', NULL, 2, 'item', 'SYNTHETIC CORRECTED ITEM', 2, 'each', 4.00, 8.00, 0.99, 'new', '2026-01-15T18:03:00Z');

INSERT INTO purchase_candidates
  (candidate_id, source_import_id, source_line_type, canonical_item_id, quantity, unit, amount, normalization_confidence, review_state, created_at)
VALUES
  ('cand_syn_rel_correction', 'imp_syn_rel_correction', 'item', 'item_syn_rel', 2, 'each', 8.00, 0.99, 'approved', '2026-01-15T18:04:00Z');

INSERT INTO purchases
  (purchase_id, source_candidate_id, source_review_state, canonical_item_id, quantity, unit, amount, acquired_at, supersedes_id, created_at)
VALUES
  ('pur_syn_rel_correction', 'cand_syn_rel_correction', 'approved', 'item_syn_rel', 2, 'each', 8.00, '2026-01-15T10:00:00Z', 'pur_syn_rel_primary', '2026-01-15T18:05:00Z');

SELECT CASE
  WHEN (SELECT COUNT(*) FROM purchases WHERE supersedes_id = 'pur_syn_rel_primary') = 1 THEN 1
  ELSE json_extract('invalid-json', '$')
END AS single_superseder_ok;

DELETE FROM purchases WHERE purchase_id IN ('pur_syn_rel_correction', 'pur_syn_rel_primary', 'pur_syn_rel_duplicate');
DELETE FROM purchase_candidates WHERE candidate_id IN ('cand_syn_rel_correction', 'cand_syn_rel_primary');
DELETE FROM import_raw_rows WHERE envelope_id = 'env_syn_rel_positive';
DELETE FROM receipt_extraction_envelopes WHERE envelope_id = 'env_syn_rel_positive';
