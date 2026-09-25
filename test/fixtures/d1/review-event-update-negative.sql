PRAGMA foreign_keys = ON;

INSERT INTO receipt_extraction_envelopes
  (envelope_id, schema_version, record_kind, source_type, source_id, extractor, extracted_at, payload_json, payload_sha256, created_at)
VALUES
  ('env_syn_event_update', '1.0.0', 'receipt_extraction_envelope', 'synthetic', 'src_syn_event_update', 'review-negative', '2026-01-16T18:00:00Z', '{"synthetic":true}', 'sha256-event-update', '2026-01-16T18:00:01Z');

INSERT INTO import_raw_rows
  (import_id, envelope_id, schema_version, record_kind, line_id, source_type, source_id, line_number, line_type, raw_text, parse_confidence, review_state, created_at)
VALUES
  ('imp_syn_event_update', 'env_syn_event_update', '1.0.0', 'import_raw_row', 'line_syn_event_update', 'synthetic', 'src_syn_event_update', 1, 'item', 'SYNTHETIC ITEM', 0.9, 'new', '2026-01-16T18:00:01Z');

INSERT INTO review_events
  (event_id, target_kind, target_id, sequence, actor_kind, actor_id, from_state, to_state, occurred_at)
VALUES
  ('rev_syn_event_update', 'import_raw_row', 'imp_syn_event_update', 1, 'automation', 'normalizer_syn', 'new', 'needs_review', '2026-01-16T18:00:30Z');

UPDATE review_events
SET reason_code = 'rewritten'
WHERE event_id = 'rev_syn_event_update';
