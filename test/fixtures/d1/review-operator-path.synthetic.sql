-- Entirely invented transaction, mirrors parameterized private review API statements.
PRAGMA foreign_keys = ON;
INSERT INTO receipt_extraction_envelopes
 (envelope_id, schema_version, record_kind, source_type, source_id, extractor,
  extracted_at, payload_json, payload_sha256, created_at)
VALUES
 ('env_syn_operator', '1.0.0', 'receipt_extraction_envelope', 'synthetic', 'src_syn_operator',
  'synthetic-operator', '2026-02-01T10:00:00Z',
  '{"purchased_at":"2026-01-30T12:00:00Z","merchant_raw":"Invented Market","receipt_total":5.50}',
  'sha256-syn-operator', '2026-02-01T10:00:00Z');

INSERT INTO import_raw_rows
 (import_id, envelope_id, schema_version, record_kind, line_id, source_type, source_id,
  line_number, line_type, raw_text, quantity, unit, extended_price, parse_confidence, created_at)
VALUES
 ('imp_syn_operator', 'env_syn_operator', '1.0.0', 'import_raw_row', 'line_syn_operator',
  'synthetic', 'src_syn_operator', 1, 'item', 'INVENTED OATS', 2, 'each', 5.50, 0.92,
  '2026-02-01T10:00:01Z');

INSERT INTO review_events
 (event_id, target_kind, target_id, sequence, actor_kind, actor_id, from_state,
  to_state, reason_code, occurred_at, metadata_json)
VALUES
 ('review_syn_operator_raw', 'import_raw_row', 'imp_syn_operator', 1,
  'user', 'owner_api_token', 'new', 'approved', 'owner_review', '2026-02-01T10:01:00Z', '{}');

INSERT INTO purchase_candidates
 (candidate_id, source_import_id, canonical_item_id, quantity, unit, amount,
  normalization_confidence, review_state, created_at)
 SELECT 'cand_syn_operator', raw.import_id, 'syn_oats', 2, 'each', 5.50,
  NULL, 'needs_review', '2026-02-01T10:02:00Z'
 FROM import_raw_rows raw JOIN receipt_extraction_envelopes envelope
  ON envelope.envelope_id = raw.envelope_id
 WHERE raw.import_id = 'imp_syn_operator' AND raw.review_state = 'approved'
  AND raw.line_type = 'item' AND envelope.duplicate_state IN ('clear', 'distinct');

INSERT INTO review_events
 (event_id, target_kind, target_id, sequence, actor_kind, actor_id, from_state,
  to_state, reason_code, occurred_at, metadata_json)
VALUES
 ('review_syn_operator_candidate', 'purchase_candidate', 'cand_syn_operator', 1,
  'user', 'owner_api_token', 'needs_review', 'approved', 'owner_review', '2026-02-01T10:03:00Z', '{}');

INSERT INTO purchases
 (purchase_id, source_candidate_id, canonical_item_id, quantity, unit,
  amount, acquired_at, supersedes_id, created_at, actor_id, actor_kind, correlation_id)
 SELECT 'purchase_syn_operator', candidate.candidate_id, candidate.canonical_item_id,
  candidate.quantity, candidate.unit, candidate.amount,
  json_extract(envelope.payload_json, '$.purchased_at'),
  NULL, '2026-02-01T10:04:00Z', 'owner_api_token', 'user', 'corr_syn_operator'
 FROM purchase_candidates candidate
 JOIN import_raw_rows raw ON raw.import_id = candidate.source_import_id
 JOIN receipt_extraction_envelopes envelope ON envelope.envelope_id = raw.envelope_id
 WHERE candidate.candidate_id = 'cand_syn_operator'
  AND candidate.review_state = 'approved'
  AND envelope.duplicate_state IN ('clear', 'distinct');

SELECT CASE WHEN
 (SELECT COUNT(*) FROM purchases WHERE purchase_id = 'purchase_syn_operator'
  AND source_review_state = 'approved'
  AND acquired_at = '2026-01-30T12:00:00Z') = 1
 AND (SELECT COUNT(*) FROM audit_events WHERE action='purchase_promoted'
  AND target_id='purchase_syn_operator' AND actor_id='owner_api_token') = 1
 AND (SELECT COUNT(*) FROM review_events WHERE actor_id='owner_api_token') = 2
 THEN 1 ELSE json_extract('invalid-json','$') END AS operator_path_passed;
