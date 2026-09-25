PRAGMA foreign_keys = ON;

INSERT INTO receipt_extraction_envelopes
  (envelope_id, schema_version, record_kind, source_type, source_id, extractor, extracted_at, payload_json, payload_sha256, created_at)
VALUES
  ('env_syn_invalid_transition', '1.0.0', 'receipt_extraction_envelope', 'synthetic', 'src_syn_invalid_transition', 'review-negative', '2026-01-16T18:00:00Z', '{"synthetic":true}', 'sha256-invalid-transition', '2026-01-16T18:00:01Z');

INSERT INTO import_raw_rows
  (import_id, envelope_id, schema_version, record_kind, line_id, source_type, source_id, line_number, line_type, raw_text, parse_confidence, review_state, created_at)
VALUES
  ('imp_syn_invalid_transition', 'env_syn_invalid_transition', '1.0.0', 'import_raw_row', 'line_syn_invalid_transition', 'synthetic', 'src_syn_invalid_transition', 1, 'item', 'SYNTHETIC ITEM', 0.9, 'new', '2026-01-16T18:00:01Z');

INSERT INTO purchase_candidates
  (candidate_id, source_import_id, source_line_type, canonical_item_id, quantity, normalization_confidence, review_state, created_at)
VALUES
  ('cand_syn_invalid_transition', 'imp_syn_invalid_transition', 'item', 'item_syn_invalid_transition', 1, 0.9, 'needs_review', '2026-01-16T18:01:00Z');

INSERT INTO review_events
  (event_id, target_kind, target_id, sequence, actor_kind, actor_id, from_state, to_state, occurred_at)
VALUES
  ('rev_syn_invalid_transition', 'purchase_candidate', 'cand_syn_invalid_transition', 1, 'user', 'reviewer_syn', 'needs_review', 'superseded', '2026-01-16T18:01:30Z');
