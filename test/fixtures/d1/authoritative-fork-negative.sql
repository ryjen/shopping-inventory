PRAGMA foreign_keys = ON;

INSERT INTO receipt_extraction_envelopes
  (envelope_id, schema_version, record_kind, source_type, source_id, evidence_id, extractor, extracted_at, payload_json, payload_sha256, created_at)
VALUES
  ('env_syn_fork', '1.0.0', 'receipt_extraction_envelope', 'synthetic', 'src_syn_fork', NULL, 'relational-negative', '2026-01-15T18:00:00Z', '{"synthetic":true}', 'sha256-fork', '2026-01-15T18:00:01Z');

INSERT INTO import_raw_rows
  (import_id, envelope_id, schema_version, record_kind, line_id, source_type, source_id, evidence_id, line_number, line_type, raw_text, quantity, unit, unit_price, extended_price, parse_confidence, review_state, created_at)
VALUES
  ('imp_syn_fork_root', 'env_syn_fork', '1.0.0', 'import_raw_row', 'line_syn_fork_root', 'synthetic', 'src_syn_fork', NULL, 1, 'item', 'SYNTHETIC ROOT ITEM', 1, 'each', 4.00, 4.00, 0.99, 'new', '2026-01-15T18:00:01Z'),
  ('imp_syn_fork_a', 'env_syn_fork', '1.0.0', 'import_raw_row', 'line_syn_fork_a', 'synthetic', 'src_syn_fork', NULL, 2, 'item', 'SYNTHETIC CORRECTION A', 2, 'each', 4.00, 8.00, 0.99, 'new', '2026-01-15T18:00:02Z'),
  ('imp_syn_fork_b', 'env_syn_fork', '1.0.0', 'import_raw_row', 'line_syn_fork_b', 'synthetic', 'src_syn_fork', NULL, 3, 'item', 'SYNTHETIC CORRECTION B', 3, 'each', 4.00, 12.00, 0.99, 'new', '2026-01-15T18:00:03Z');

INSERT INTO purchase_candidates
  (candidate_id, source_import_id, source_line_type, canonical_item_id, quantity, unit, amount, normalization_confidence, review_state, created_at)
VALUES
  ('cand_syn_fork_root', 'imp_syn_fork_root', 'item', 'item_syn_fork', 1, 'each', 4.00, 0.99, 'needs_review', '2026-01-15T18:01:00Z'),
  ('cand_syn_fork_a', 'imp_syn_fork_a', 'item', 'item_syn_fork', 2, 'each', 8.00, 0.99, 'needs_review', '2026-01-15T18:01:01Z'),
  ('cand_syn_fork_b', 'imp_syn_fork_b', 'item', 'item_syn_fork', 3, 'each', 12.00, 0.99, 'needs_review', '2026-01-15T18:01:02Z');

INSERT INTO review_events
  (event_id, target_kind, target_id, sequence, actor_kind, actor_id, from_state, to_state, occurred_at)
VALUES
  ('rev_syn_fork_root', 'purchase_candidate', 'cand_syn_fork_root', 1, 'user', 'reviewer_syn', 'needs_review', 'approved', '2026-01-15T18:01:10Z'),
  ('rev_syn_fork_a', 'purchase_candidate', 'cand_syn_fork_a', 1, 'user', 'reviewer_syn', 'needs_review', 'approved', '2026-01-15T18:01:11Z'),
  ('rev_syn_fork_b', 'purchase_candidate', 'cand_syn_fork_b', 1, 'user', 'reviewer_syn', 'needs_review', 'approved', '2026-01-15T18:01:12Z');

INSERT INTO purchases
  (purchase_id, source_candidate_id, source_review_state, canonical_item_id, quantity, unit, amount, acquired_at, supersedes_id, created_at, actor_id, actor_kind)
VALUES
  ('pur_syn_fork_root', 'cand_syn_fork_root', 'approved', 'item_syn_fork', 1, 'each', 4.00, '2026-01-15T10:00:00Z', NULL, '2026-01-15T18:02:00Z', 'reviewer_syn', 'user'),
  ('pur_syn_fork_a', 'cand_syn_fork_a', 'approved', 'item_syn_fork', 2, 'each', 8.00, '2026-01-15T10:00:00Z', 'pur_syn_fork_root', '2026-01-15T18:03:00Z', 'reviewer_syn', 'user');

INSERT INTO purchases
  (purchase_id, source_candidate_id, source_review_state, canonical_item_id, quantity, unit, amount, acquired_at, supersedes_id, created_at, actor_id, actor_kind)
VALUES
  ('pur_syn_fork_b', 'cand_syn_fork_b', 'approved', 'item_syn_fork', 3, 'each', 12.00, '2026-01-15T10:00:00Z', 'pur_syn_fork_root', '2026-01-15T18:04:00Z', 'reviewer_syn', 'user');
