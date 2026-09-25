PRAGMA foreign_keys = ON;

INSERT INTO receipt_extraction_envelopes
  (envelope_id, schema_version, record_kind, source_type, source_id, evidence_id, extractor, extracted_at, payload_json, payload_sha256, created_at)
VALUES
  ('env_syn_review_positive', '1.0.0', 'receipt_extraction_envelope', 'synthetic', 'src_syn_review_positive', NULL, 'review-audit-smoke', '2026-01-16T18:00:00Z', '{"synthetic":true}', 'sha256-review-positive', '2026-01-16T18:00:01Z');

INSERT INTO import_raw_rows
  (import_id, envelope_id, schema_version, record_kind, line_id, source_type, source_id, evidence_id, line_number, line_type, raw_text, quantity, unit, unit_price, extended_price, parse_confidence, review_state, created_at)
VALUES
  ('imp_syn_review_positive', 'env_syn_review_positive', '1.0.0', 'import_raw_row', 'line_syn_review_positive', 'synthetic', 'src_syn_review_positive', NULL, 1, 'item', 'SYNTHETIC REVIEW ITEM', 1, 'each', 3.00, 3.00, 0.91, 'new', '2026-01-16T18:00:01Z');

INSERT INTO review_events
  (event_id, target_kind, target_id, sequence, actor_kind, actor_id, from_state, to_state, reason_code, correlation_id, occurred_at)
VALUES
  ('rev_syn_raw_positive', 'import_raw_row', 'imp_syn_review_positive', 1, 'automation', 'normalizer_syn', 'new', 'needs_review', 'low_confidence', 'corr_syn_review', '2026-01-16T18:00:30Z');

SELECT CASE
  WHEN (
    SELECT review_state = 'needs_review' AND review_version = 1
    FROM import_raw_rows WHERE import_id = 'imp_syn_review_positive'
  ) THEN 1 ELSE json_extract('invalid-json', '$')
END AS raw_projection_ok;

INSERT INTO purchase_candidates
  (candidate_id, source_import_id, source_line_type, canonical_item_id, quantity, unit, amount, normalization_confidence, review_state, created_at)
VALUES
  ('cand_syn_review_positive', 'imp_syn_review_positive', 'item', 'item_syn_review_positive', 1, 'each', 3.00, 0.91, 'needs_review', '2026-01-16T18:01:00Z');

INSERT INTO review_events
  (event_id, target_kind, target_id, sequence, actor_kind, actor_id, from_state, to_state, reason_code, correlation_id, occurred_at)
VALUES
  ('rev_syn_candidate_positive', 'purchase_candidate', 'cand_syn_review_positive', 1, 'user', 'reviewer_syn', 'needs_review', 'approved', 'verified', 'corr_syn_review', '2026-01-16T18:01:30Z');

SELECT CASE
  WHEN (
    SELECT review_state = 'approved' AND review_version = 1
    FROM purchase_candidates WHERE candidate_id = 'cand_syn_review_positive'
  ) THEN 1 ELSE json_extract('invalid-json', '$')
END AS candidate_projection_ok;

INSERT INTO purchases
  (purchase_id, source_candidate_id, source_review_state, canonical_item_id, quantity, unit, amount, acquired_at, supersedes_id, created_at, actor_id, actor_kind, correlation_id)
VALUES
  ('pur_syn_review_positive', 'cand_syn_review_positive', 'approved', 'item_syn_review_positive', 1, 'each', 3.00, '2026-01-16T10:00:00Z', NULL, '2026-01-16T18:02:00Z', 'reviewer_syn', 'user', 'corr_syn_review');

SELECT CASE
  WHEN (
    SELECT COUNT(*) FROM audit_events
    WHERE action = 'purchase_promoted'
      AND target_kind = 'purchase'
      AND target_id = 'pur_syn_review_positive'
      AND actor_id = 'reviewer_syn'
      AND actor_kind = 'user'
      AND correlation_id = 'corr_syn_review'
      AND json_extract(metadata_json, '$.source_candidate_id') = 'cand_syn_review_positive'
  ) = 1 THEN 1 ELSE json_extract('invalid-json', '$')
END AS promotion_audit_ok;
