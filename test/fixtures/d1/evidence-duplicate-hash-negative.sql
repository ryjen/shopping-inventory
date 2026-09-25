INSERT INTO receipt_evidence
  (evidence_id, receipt_id, object_key, content_type, byte_length, source_sha256, created_at)
VALUES
  ('evidence_syn_hash_001', 'receipt_syn_hash_001', 'receipts/receipt_syn_hash_001/evidence_syn_hash_001', 'image/jpeg', 3,
   'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa', '2026-01-17T10:00:00Z');

-- Must fail: two active evidence objects cannot represent the same exact bytes.
INSERT INTO receipt_evidence
  (evidence_id, receipt_id, object_key, content_type, byte_length, source_sha256, created_at)
VALUES
  ('evidence_syn_hash_002', 'receipt_syn_hash_002', 'receipts/receipt_syn_hash_002/evidence_syn_hash_002', 'image/jpeg', 3,
   'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa', '2026-01-17T10:00:01Z');
