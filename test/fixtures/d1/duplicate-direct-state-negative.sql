INSERT INTO receipt_extraction_envelopes
  (envelope_id, schema_version, record_kind, source_type, source_id, extractor, extracted_at, payload_json, payload_sha256, transaction_fingerprint, created_at)
VALUES
  ('env_syn_dup_direct_a', '1.0.0', 'receipt_extraction_envelope', 'synthetic', 'src_dup_direct_a', 'duplicate-policy-test',
   '2026-01-18T18:00:00Z', '{"synthetic":true}', 'sha256-env_syn_dup_direct_a', 'eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee', '2026-01-18T18:00:01Z');

INSERT INTO receipt_extraction_envelopes
  (envelope_id, schema_version, record_kind, source_type, source_id, extractor, extracted_at, payload_json, payload_sha256, transaction_fingerprint, created_at)
VALUES
  ('env_syn_dup_direct_b', '1.0.0', 'receipt_extraction_envelope', 'synthetic', 'src_dup_direct_b', 'duplicate-policy-test',
   '2026-01-18T18:00:00Z', '{"synthetic":true}', 'sha256-env_syn_dup_direct_b', 'eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee', '2026-01-18T18:00:01Z');

-- Must fail: verdicts require append-only duplicate_events.

UPDATE receipt_extraction_envelopes
SET duplicate_state = 'distinct', duplicate_version = 1
WHERE envelope_id = 'env_syn_dup_direct_b';
