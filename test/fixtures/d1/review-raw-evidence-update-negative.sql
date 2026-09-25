PRAGMA foreign_keys = ON;

INSERT INTO receipt_extraction_envelopes
  (envelope_id, schema_version, record_kind, source_type, source_id, extractor, extracted_at, payload_json, payload_sha256, created_at)
VALUES
  ('env_syn_raw_update', '1.0.0', 'receipt_extraction_envelope', 'synthetic', 'src_syn_raw_update', 'review-negative', '2026-01-16T18:00:00Z', '{"synthetic":true}', 'sha256-raw-update', '2026-01-16T18:00:01Z');

INSERT INTO import_raw_rows
  (import_id, envelope_id, schema_version, record_kind, line_id, source_type, source_id, line_number, line_type, raw_text, parse_confidence, review_state, created_at)
VALUES
  ('imp_syn_raw_update', 'env_syn_raw_update', '1.0.0', 'import_raw_row', 'line_syn_raw_update', 'synthetic', 'src_syn_raw_update', 1, 'item', 'SYNTHETIC ORIGINAL', 0.9, 'new', '2026-01-16T18:00:01Z');

UPDATE import_raw_rows
SET raw_text = 'SYNTHETIC REWRITE'
WHERE import_id = 'imp_syn_raw_update';
