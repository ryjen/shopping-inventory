PRAGMA foreign_keys = ON;

DELETE FROM purchases WHERE purchase_id = 'pur_syn_unapproved';
DELETE FROM purchase_candidates WHERE candidate_id = 'cand_syn_unapproved';
DELETE FROM import_raw_rows WHERE envelope_id = 'env_syn_unapproved';
DELETE FROM receipt_extraction_envelopes WHERE envelope_id = 'env_syn_unapproved';

INSERT INTO receipt_extraction_envelopes
  (envelope_id, schema_version, record_kind, source_type, source_id, evidence_id, extractor, extracted_at, payload_json, payload_sha256, created_at)
VALUES
  ('env_syn_unapproved', '1.0.0', 'receipt_extraction_envelope', 'synthetic', 'src_syn_unapproved', NULL, 'relational-negative', '2026-01-15T18:00:00Z', '{"synthetic":true}', 'sha256-unapproved', '2026-01-15T18:00:01Z');

INSERT INTO import_raw_rows
  (import_id, envelope_id, schema_version, record_kind, line_id, source_type, source_id, evidence_id, line_number, line_type, raw_text, quantity, unit, unit_price, extended_price, parse_confidence, review_state, created_at)
VALUES
  ('imp_syn_unapproved', 'env_syn_unapproved', '1.0.0', 'import_raw_row', 'line_syn_unapproved', 'synthetic', 'src_syn_unapproved', NULL, 1, 'item', 'SYNTHETIC ITEM', 1, 'each', 4.00, 4.00, 0.99, 'new', '2026-01-15T18:00:01Z');

INSERT INTO purchase_candidates
  (candidate_id, source_import_id, source_line_type, canonical_item_id, quantity, unit, amount, normalization_confidence, review_state, created_at)
VALUES
  ('cand_syn_unapproved', 'imp_syn_unapproved', 'item', 'item_syn_unapproved', 1, 'each', 4.00, 0.98, 'needs_review', '2026-01-15T18:01:00Z');

-- Must fail: source_review_state is constrained to 'approved', but the referenced
-- candidate is still needs_review.
INSERT INTO purchases
  (purchase_id, source_candidate_id, source_review_state, canonical_item_id, quantity, unit, amount, acquired_at, supersedes_id, created_at)
VALUES
  ('pur_syn_unapproved', 'cand_syn_unapproved', 'approved', 'item_syn_unapproved', 1, 'each', 4.00, '2026-01-15T10:00:00Z', NULL, '2026-01-15T18:02:00Z');
