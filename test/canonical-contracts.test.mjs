import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const fixture = JSON.parse(await readFile(new URL('../evaluation/fixtures/canonical-receipt-v1.synthetic.json', import.meta.url), 'utf8'));
const schema = JSON.parse(await readFile(new URL('../schemas/v1/shopping-inventory.schema.json', import.meta.url), 'utf8'));

const inventoryBearing = new Set(['item']);
const nonInventory = new Set(['fee','deposit','discount','coupon','subtotal','tax','total','informational','refund','void']);

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

test('only item evidence can create an inventory-bearing candidate', () => {
  const source = fixture.raw_rows.find((row) => row.import_id === fixture.candidate.source_import_id);
  assert.ok(source);
  assert.ok(inventoryBearing.has(source.line_type));
  assert.ok(fixture.raw_rows.filter((row) => nonInventory.has(row.line_type)).every((row) => row.import_id !== fixture.candidate.source_import_id));
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
