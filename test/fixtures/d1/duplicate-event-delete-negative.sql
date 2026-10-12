INSERT INTO receipt_extraction_envelopes
  (envelope_id, schema_version, record_kind, source_type, source_id, extractor, extracted_at, payload_json, payload_sha256, transaction_fingerprint, created_at)
VALUES
  ('env_syn_dup_delete_a', '1.0.0', 'receipt_extraction_envelope', 'synthetic', 'src_dup_delete_a',
   'duplicate-policy-test', '2026-01-18T18:00:00Z', '{"synthetic":true}', 'sha256-env_syn_dup_delete_a',
   '1111111111111111111111111111111111111111111111111111111111111111', '2026-01-18T18:00:01Z');

INSERT INTO receipt_extraction_envelopes
  (envelope_id, schema_version, record_kind, source_type, source_id, extractor, extracted_at, payload_json, payload_sha256, transaction_fingerprint, created_at)
VALUES
  ('env_syn_dup_delete_b', '1.0.0', 'receipt_extraction_envelope', 'synthetic', 'src_dup_delete_b',
   'duplicate-policy-test', '2026-01-18T18:00:00Z', '{"synthetic":true}', 'sha256-env_syn_dup_delete_b',
   '1111111111111111111111111111111111111111111111111111111111111111', '2026-01-18T18:00:01Z');

INSERT INTO duplicate_events
  (event_id, envelope_id, sequence, actor_kind, actor_id, from_state, to_state, reason_code, occurred_at, metadata_json)
VALUES
  ('dup_event_syn_delete', 'env_syn_dup_delete_b', 1, 'user', 'reviewer_syn', 'needs_review', 'distinct',
   'manual_duplicate_review', '2026-01-18T18:00:03Z', '{}');

-- Must fail: duplicate decisions are append-only.
DELETE FROM duplicate_events
WHERE event_id = 'dup_event_syn_delete';
