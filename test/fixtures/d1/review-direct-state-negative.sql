PRAGMA foreign_keys = ON;

INSERT INTO receipt_extraction_envelopes
  (envelope_id, schema_version, record_kind, source_type, source_id, extractor, extracted_at, payload_json, payload_sha256, created_at)
VALUES
  ('env_syn_direct_state', '1.0.0', 'receipt_extraction_envelope', 'synthetic', 'src_syn_direct_state', 'review-negative', '2026-01-16T18:00:00Z', '{"synthetic":true}', 'sha256-direct-state', '2026-01-16T18:00:01Z');

INSERT INTO import_raw_rows
  (import_id, envelope_id, schema_version, record_kind, line_id, source_type, source_id, line_number, line_type, raw_text, parse_confidence, review_state, created_at)
VALUES
  ('imp_syn_direct_state', 'env_syn_direct_state', '1.0.0', 'import_raw_row', 'line_syn_direct_state', 'synthetic', 'src_syn_direct_state', 1, 'item', 'SYNTHETIC ITEM', 0.9, 'new', '2026-01-16T18:00:01Z');

INSERT INTO purchase_candidates
  (candidate_id, source_import_id, source_line_type, canonical_item_id, quantity, normalization_confidence, review_state, created_at)
VALUES
  ('cand_syn_direct_state', 'imp_syn_direct_state', 'item', 'item_syn_direct_state', 1, 0.9, 'needs_review', '2026-01-16T18:01:00Z');

UPDATE purchase_candidates
SET review_state = 'approved'
WHERE candidate_id = 'cand_syn_direct_state';
