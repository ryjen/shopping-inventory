DELETE FROM import_raw_rows WHERE envelope_id = 'env_syn_d1_smoke';
DELETE FROM receipt_extraction_envelopes WHERE envelope_id = 'env_syn_d1_smoke';

INSERT INTO receipt_extraction_envelopes
  (envelope_id, schema_version, record_kind, source_type, source_id, evidence_id, extractor, extracted_at, payload_json, payload_sha256, created_at)
VALUES
  ('env_syn_d1_smoke', '1.0.0', 'receipt_extraction_envelope', 'synthetic', 'src_syn_d1_smoke', NULL, 'd1-smoke', '2026-01-15T18:00:00Z', '{"synthetic":true}', 'sha256-synthetic-smoke', '2026-01-15T18:00:01Z');

INSERT INTO import_raw_rows
  (import_id, envelope_id, schema_version, record_kind, line_id, source_type, source_id, evidence_id, line_number, line_type, raw_text, quantity, unit, unit_price, extended_price, parse_confidence, review_state, created_at)
SELECT
  json_extract(value, '$.import_id'),
  'env_syn_d1_smoke',
  '1.0.0',
  'import_raw_row',
  json_extract(value, '$.line_id'),
  'synthetic',
  'src_syn_d1_smoke',
  NULL,
  json_extract(value, '$.line_number'),
  json_extract(value, '$.line_type'),
  json_extract(value, '$.raw_text'),
  json_extract(value, '$.quantity'),
  json_extract(value, '$.unit'),
  json_extract(value, '$.unit_price'),
  json_extract(value, '$.extended_price'),
  json_extract(value, '$.parse_confidence'),
  'new',
  '2026-01-15T18:00:01Z'
FROM json_each('[{"import_id":"imp_syn_d1_001","line_id":"line_syn_d1_001","line_number":1,"line_type":"item","raw_text":"SYNTHETIC ITEM A","quantity":1,"unit":"each","unit_price":2.00,"extended_price":2.00,"parse_confidence":0.99},{"import_id":"imp_syn_d1_002","line_id":"line_syn_d1_002","line_number":2,"line_type":"deposit","raw_text":"SYNTHETIC DEPOSIT","quantity":null,"unit":null,"unit_price":null,"extended_price":0.10,"parse_confidence":0.98}]');

-- Force the command to fail if json_each did not expand and persist both rows.
SELECT CASE
  WHEN (SELECT COUNT(*) FROM import_raw_rows WHERE envelope_id = 'env_syn_d1_smoke') = 2 THEN 1
  ELSE json_extract('invalid-json', '$')
END AS staging_smoke_ok;

DELETE FROM import_raw_rows WHERE envelope_id = 'env_syn_d1_smoke';
DELETE FROM receipt_extraction_envelopes WHERE envelope_id = 'env_syn_d1_smoke';
