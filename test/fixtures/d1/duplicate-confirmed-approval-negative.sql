INSERT INTO receipt_extraction_envelopes
  (envelope_id, schema_version, record_kind, source_type, source_id, extractor, extracted_at, payload_json, payload_sha256, transaction_fingerprint, created_at)
VALUES
  ('env_syn_dup_confirmed_a', '1.0.0', 'receipt_extraction_envelope', 'synthetic', 'src_dup_confirmed_a', 'duplicate-policy-test',
   '2026-01-18T18:00:00Z', '{"synthetic":true}', 'sha256-env_syn_dup_confirmed_a', 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb', '2026-01-18T18:00:01Z');

INSERT INTO receipt_extraction_envelopes
  (envelope_id, schema_version, record_kind, source_type, source_id, extractor, extracted_at, payload_json, payload_sha256, transaction_fingerprint, created_at)
VALUES
  ('env_syn_dup_confirmed_b', '1.0.0', 'receipt_extraction_envelope', 'synthetic', 'src_dup_confirmed_b', 'duplicate-policy-test',
   '2026-01-18T18:00:00Z', '{"synthetic":true}', 'sha256-env_syn_dup_confirmed_b', 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb', '2026-01-18T18:00:01Z');

INSERT INTO import_raw_rows
  (import_id, envelope_id, schema_version, record_kind, line_id, source_type, source_id, line_number, line_type, raw_text, quantity, unit, extended_price, parse_confidence, review_state, created_at)
VALUES
  ('imp_syn_dup_confirmed', 'env_syn_dup_confirmed_b', '1.0.0', 'import_raw_row', 'line_imp_syn_dup_confirmed', 'synthetic', 'src_imp_syn_dup_confirmed', 1, 'item',
   'SYNTHETIC ITEM', 1, 'each', 4.00, 0.99, 'new', '2026-01-18T18:00:02Z');

INSERT INTO purchase_candidates
  (candidate_id, source_import_id, source_line_type, canonical_item_id, quantity, unit, amount, normalization_confidence, review_state, created_at)
VALUES
  ('cand_syn_dup_confirmed', 'imp_syn_dup_confirmed', 'item', 'item_syn_duplicate', 1, 'each', 4.00, 0.99, 'needs_review', '2026-01-18T18:00:03Z');

INSERT INTO duplicate_events
  (event_id, envelope_id, sequence, actor_kind, actor_id, from_state, to_state, reason_code, occurred_at, metadata_json)
VALUES
  ('dup_event_syn_confirmed', 'env_syn_dup_confirmed_b', 1, 'user', 'reviewer_syn', 'needs_review', 'confirmed_duplicate',
   'manual_duplicate_review', '2026-01-18T18:00:03Z', '{}');

-- Must fail: confirmed duplicate evidence cannot become an acquisition.

INSERT INTO review_events
  (event_id, target_kind, target_id, sequence, actor_kind, actor_id, from_state, to_state, reason_code, occurred_at, metadata_json)
VALUES
  ('review_event_syn_dup_confirmed', 'purchase_candidate', 'cand_syn_dup_confirmed', 1, 'user', 'reviewer_syn', 'needs_review', 'approved',
   'manual_review', '2026-01-18T18:00:04Z', '{}');
