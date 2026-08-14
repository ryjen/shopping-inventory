PRAGMA foreign_keys = ON;

DELETE FROM purchase_candidates WHERE candidate_id = 'cand_syn_non_item';
DELETE FROM import_raw_rows WHERE envelope_id = 'env_syn_non_item';
DELETE FROM receipt_extraction_envelopes WHERE envelope_id = 'env_syn_non_item';

INSERT INTO receipt_extraction_envelopes
  (envelope_id, schema_version, record_kind, source_type, source_id, evidence_id, extractor, extracted_at, payload_json, payload_sha256, created_at)
VALUES
  ('env_syn_non_item', '1.0.0', 'receipt_extraction_envelope', 'synthetic', 'src_syn_non_item', NULL, 'relational-negative', '2026-01-15T18:00:00Z', '{"synthetic":true}', 'sha256-non-item', '2026-01-15T18:00:01Z');

INSERT INTO import_raw_rows
  (import_id, envelope_id, schema_version, record_kind, line_id, source_type, source_id, evidence_id, line_number, line_type, raw_text, quantity, unit, unit_price, extended_price, parse_confidence, review_state, created_at)
VALUES
  ('imp_syn_deposit', 'env_syn_non_item', '1.0.0', 'import_raw_row', 'line_syn_deposit', 'synthetic', 'src_syn_non_item', NULL, 1, 'deposit', 'SYNTHETIC DEPOSIT', NULL, NULL, NULL, 0.10, 0.99, 'new', '2026-01-15T18:00:01Z');

-- Must fail: the relational guard requires source_line_type='item', but the
-- referenced raw row is actually a deposit.
INSERT INTO purchase_candidates
  (candidate_id, source_import_id, source_line_type, canonical_item_id, quantity, unit, amount, normalization_confidence, review_state, created_at)
VALUES
  ('cand_syn_non_item', 'imp_syn_deposit', 'item', 'item_syn_invalid', 1, 'each', 0.10, 0.90, 'needs_review', '2026-01-15T18:01:00Z');
