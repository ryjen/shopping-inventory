import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import Ajv2020 from 'ajv/dist/2020.js';
import addFormats from 'ajv-formats';

const fixture = JSON.parse(await readFile(new URL('../evaluation/fixtures/canonical-receipt-v1.synthetic.json', import.meta.url), 'utf8'));
const schema = JSON.parse(await readFile(new URL('../schemas/v1/shopping-inventory.schema.json', import.meta.url), 'utf8'));

const ajv = new Ajv2020({ allErrors: true, strict: true });
addFormats(ajv);
ajv.addSchema(schema);

const rootValidator = ajv.getSchema(schema.$id);
const validators = {
  envelope: ajv.compile({ $ref: `${schema.$id}#/$defs/receiptExtractionEnvelope` }),
  rawRow: ajv.compile({ $ref: `${schema.$id}#/$defs/importRawRow` }),
  candidate: ajv.compile({ $ref: `${schema.$id}#/$defs/purchaseCandidate` }),
  purchase: ajv.compile({ $ref: `${schema.$id}#/$defs/purchase` }),
};

const promotableLineTypes = new Set(['item']);
const nonPromotableLineTypes = new Set(['fee','deposit','discount','coupon','subtotal','tax','total','informational','return','refund','void']);

function assertValid(validate, value, label) {
  const valid = validate(value);
  assert.equal(valid, true, `${label}: ${ajv.errorsText(validate.errors, { separator: '; ' })}`);
}

function canPromoteToPurchaseCandidate(rawRow) {
  return promotableLineTypes.has(rawRow.line_type);
}

test('schema root validates exactly the supported canonical record kinds', () => {
  assert.ok(rootValidator);

  assertValid(rootValidator, fixture.envelope, 'envelope root validation');
  for (const row of fixture.raw_rows) assertValid(rootValidator, row, `raw row ${row.import_id}`);
  assertValid(rootValidator, fixture.candidate, 'candidate root validation');
  assertValid(rootValidator, fixture.purchase, 'purchase root validation');

  assert.equal(rootValidator({}), false, 'arbitrary objects must not satisfy the canonical schema root');
  assert.equal(rootValidator({ schema_version: '1.0.0', record_kind: 'unknown' }), false);
});

test('synthetic fixture validates each stage with JSON Schema 2020-12', () => {
  assert.equal(fixture.synthetic, true);
  assertValid(validators.envelope, fixture.envelope, 'receipt extraction envelope');
  for (const row of fixture.raw_rows) assertValid(validators.rawRow, row, `import raw row ${row.import_id}`);
  assertValid(validators.candidate, fixture.candidate, 'purchase candidate');
  assertValid(validators.purchase, fixture.purchase, 'purchase');
});

test('schema rejects malformed canonical records rather than only documenting fields', () => {
  const invalidCandidate = { ...fixture.candidate };
  delete invalidCandidate.source_import_id;
  assert.equal(validators.candidate(invalidCandidate), false);

  const invalidEnvelope = { ...fixture.envelope, currency: 'Canadian dollars' };
  assert.equal(validators.envelope(invalidEnvelope), false);
});

test('schema publishes distinct versioned record kinds', () => {
  assert.equal(schema.$defs.receiptExtractionEnvelope.properties.record_kind.const, 'receipt_extraction_envelope');
  assert.equal(schema.$defs.importRawRow.properties.record_kind.const, 'import_raw_row');
  assert.equal(schema.$defs.purchaseCandidate.properties.record_kind.const, 'purchase_candidate');
  assert.equal(schema.$defs.purchase.properties.record_kind.const, 'purchase');
});

test('synthetic fixture preserves traceability across stages', () => {
  const { envelope, raw_rows: rows, candidate, purchase } = fixture;
  assert.equal(envelope.schema_version, '1.0.0');
  assert.ok(rows.every((row) => row.envelope_id === envelope.envelope_id));
  assert.ok(rows.some((row) => row.import_id === candidate.source_import_id));
  assert.equal(purchase.source_candidate_id, candidate.candidate_id);
  assert.equal(purchase.canonical_item_id, candidate.canonical_item_id);
});

test('only item evidence can create a v1 purchase candidate', () => {
  const source = fixture.raw_rows.find((row) => row.import_id === fixture.candidate.source_import_id);
  assert.ok(source);
  assert.equal(canPromoteToPurchaseCandidate(source), true);
  assert.ok(fixture.raw_rows.filter((row) => nonPromotableLineTypes.has(row.line_type)).every((row) => row.import_id !== fixture.candidate.source_import_id));
});

test('return evidence is valid raw evidence but review-only in v1', () => {
  const returnRow = {
    ...fixture.raw_rows[0],
    import_id: 'imp_syn_return',
    line_id: 'line_syn_return',
    line_type: 'return',
    raw_text: 'SYNTHETIC RETURNED ITEM',
    quantity: 1,
    unit: 'each',
    unit_price: 4.00,
    extended_price: -4.00,
    review_state: 'needs_review',
  };

  assertValid(validators.rawRow, returnRow, 'synthetic return raw row');
  assert.equal(canPromoteToPurchaseCandidate(returnRow), false);
});

test('raw evidence does not contain canonical item fields', () => {
  for (const row of fixture.raw_rows) {
    assert.equal('canonical_item_id' in row, false);
    assert.equal('suggested_item' in row, false);
  }
});

test('opaque identifiers do not embed synthetic merchant or date context', () => {
  const ids = [fixture.envelope.envelope_id, ...fixture.raw_rows.map((row) => row.import_id), fixture.candidate.candidate_id, fixture.purchase.purchase_id];
  for (const id of ids) {
    assert.doesNotMatch(id, /example|market|2026|01-15/i);
  }
});
