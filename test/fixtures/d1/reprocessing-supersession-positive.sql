INSERT INTO receipt_extraction_envelopes
  (envelope_id, schema_version, record_kind, source_type, source_id, extractor, extracted_at, payload_json, payload_sha256, transaction_fingerprint, created_at)
VALUES
  ('env_syn_reprocess_positive', '1.0.0', 'receipt_extraction_envelope', 'synthetic', 'src_reprocess_positive', 'duplicate-policy-test',
   '2026-01-18T18:00:00Z', '{"synthetic":true}', 'sha256-env_syn_reprocess_positive', NULL, '2026-01-18T18:00:01Z');

INSERT INTO import_raw_rows
  (import_id, envelope_id, schema_version, record_kind, line_id, source_type, source_id, line_number, line_type, raw_text, quantity, unit, extended_price, parse_confidence, review_state, created_at)
VALUES
  ('imp_syn_reprocess_positive', 'env_syn_reprocess_positive', '1.0.0', 'import_raw_row', 'line_imp_syn_reprocess_positive', 'synthetic', 'src_imp_syn_reprocess_positive', 1, 'item',
   'SYNTHETIC ITEM', 1, 'each', 4.00, 0.99, 'new', '2026-01-18T18:00:02Z');

INSERT INTO purchase_candidates
  (candidate_id, source_import_id, source_line_type, canonical_item_id, quantity, unit, amount, normalization_confidence, review_state, created_at)
VALUES
  ('cand_syn_reprocess_positive_1', 'imp_syn_reprocess_positive', 'item', 'item_syn_reprocess_v1', 1, 'each', 4.00, 0.99, 'needs_review', '2026-01-18T18:00:03Z');

INSERT INTO review_events
  (event_id, target_kind, target_id, sequence, actor_kind, actor_id, from_state, to_state, reason_code, occurred_at, metadata_json)
VALUES
  ('review_event_syn_reprocess_positive_1', 'purchase_candidate', 'cand_syn_reprocess_positive_1', 1, 'user', 'reviewer_syn', 'needs_review', 'approved',
   'manual_review', '2026-01-18T18:00:04Z', '{}');

INSERT INTO purchases
  (purchase_id, source_candidate_id, source_review_state, canonical_item_id, quantity, unit, amount, acquired_at, supersedes_id, created_at, actor_id, actor_kind, correlation_id)
VALUES
  ('pur_syn_reprocess_positive_1', 'cand_syn_reprocess_positive_1', 'approved', 'item_syn_reprocess_v1', 1, 'each', 4.00, '2026-01-18T10:00:00Z', NULL,
   '2026-01-18T18:00:05Z', 'reviewer_syn', 'user', 'corr_pur_syn_reprocess_positive_1');

INSERT INTO purchase_candidates
  (candidate_id, source_import_id, source_line_type, canonical_item_id, quantity, unit, amount, normalization_confidence, review_state, created_at)
VALUES
  ('cand_syn_reprocess_positive_2', 'imp_syn_reprocess_positive', 'item', 'item_syn_reprocess_v2', 1, 'each', 4.00, 0.99, 'needs_review', '2026-01-18T18:00:03Z');

INSERT INTO review_events
  (event_id, target_kind, target_id, sequence, actor_kind, actor_id, from_state, to_state, reason_code, occurred_at, metadata_json)
VALUES
  ('review_event_syn_reprocess_positive_2', 'purchase_candidate', 'cand_syn_reprocess_positive_2', 1, 'user', 'reviewer_syn', 'needs_review', 'approved',
   'manual_review', '2026-01-18T18:00:04Z', '{}');

INSERT INTO purchases
  (purchase_id, source_candidate_id, source_review_state, canonical_item_id, quantity, unit, amount, acquired_at, supersedes_id, created_at, actor_id, actor_kind, correlation_id)
VALUES
  ('pur_syn_reprocess_positive_2', 'cand_syn_reprocess_positive_2', 'approved', 'item_syn_reprocess_v2', 1, 'each', 4.00, '2026-01-18T10:00:00Z', 'pur_syn_reprocess_positive_1',
   '2026-01-18T18:00:05Z', 'reviewer_syn', 'user', 'corr_pur_syn_reprocess_positive_2');
