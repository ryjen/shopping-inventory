import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import Ajv2020 from "ajv/dist/2020.js";
import addFormats from "ajv-formats";

import { runSyntheticVerticalSlice } from "../src/domain/vertical-slice.mjs";

const fixture = JSON.parse(await readFile(
  new URL("../evaluation/fixtures/vertical-slice-v1.synthetic.json", import.meta.url),
  "utf8",
));
const canonicalSchema = JSON.parse(await readFile(
  new URL("../schemas/v1/shopping-inventory.schema.json", import.meta.url),
  "utf8",
));
const derivedSchema = JSON.parse(await readFile(
  new URL("../schemas/v1/derived.schema.json", import.meta.url),
  "utf8",
));

const ajv = new Ajv2020({ allErrors: true, strict: true });
addFormats(ajv);
ajv.addSchema(canonicalSchema);
ajv.addSchema(derivedSchema);

const validateCanonical = ajv.getSchema(canonicalSchema.$id);
const validateDerived = ajv.getSchema(derivedSchema.$id);

function assertValid(validate, value, label) {
  const valid = validate(value);
  assert.equal(valid, true, `${label}: ${ajv.errorsText(validate.errors, { separator: "; " })}`);
}

const result = runSyntheticVerticalSlice(fixture);

test("vertical-slice fixture and every acquisition-stage record are schema-valid", () => {
  assert.equal(fixture.synthetic, true);
  assertValid(validateCanonical, result.envelope, "extraction envelope");
  for (const row of result.rawRows) assertValid(validateCanonical, row, `raw ${row.import_id}`);
  for (const candidate of result.candidates) assertValid(validateCanonical, candidate, `candidate ${candidate.candidate_id}`);
  for (const purchase of result.purchases) assertValid(validateCanonical, purchase, `purchase ${purchase.purchase_id}`);
});

test("derived Stock, Budget, and Recommendation records are separately versioned and schema-valid", () => {
  assert.equal(validateDerived({}), false, "derived schema root must reject arbitrary objects");
  for (const snapshot of result.stockSnapshots) assertValid(validateDerived, snapshot, `stock ${snapshot.snapshot_id}`);
  assertValid(validateDerived, result.budgetExport, "budget export");
  for (const recommendation of result.recommendations) {
    assertValid(validateDerived, recommendation, `recommendation ${recommendation.recommendation_id}`);
  }
});

test("all receipt evidence is flattened with provenance and only item lines become candidates", () => {
  assert.equal(result.rawRows.length, fixture.envelope.lines.length);
  assert.ok(result.rawRows.every((row) => row.envelope_id === fixture.envelope.envelope_id));
  assert.ok(result.rawRows.every((row) => row.source.source_id === fixture.envelope.source.source_id));

  const itemRows = result.rawRows.filter((row) => row.line_type === "item");
  assert.equal(itemRows.length, 2);
  assert.equal(result.candidates.length, 2);
  assert.deepEqual(
    result.candidates.map((candidate) => candidate.source_import_id).sort(),
    itemRows.map((row) => row.import_id).sort(),
  );

  const deposit = result.rawRows.find((row) => row.line_type === "deposit");
  assert.ok(deposit);
  assert.equal(result.candidates.some((candidate) => candidate.source_import_id === deposit.import_id), false);
});

test("explicit review approves the confident candidate and leaves the ambiguous candidate review-only", () => {
  const approved = result.candidates.find((candidate) => candidate.review_state === "approved");
  const pending = result.candidates.find((candidate) => candidate.review_state === "needs_review");

  assert.ok(approved);
  assert.ok(pending);
  assert.equal(approved.canonical_item_id, "item_moon_pear");
  assert.equal(pending.canonical_item_id, "item_moon_herb");
  assert.ok(approved.normalization_confidence > pending.normalization_confidence);
  assert.equal(result.purchases.length, 1);
  assert.equal(result.purchases[0].source_candidate_id, approved.candidate_id);
  assert.equal(result.purchases.some((purchase) => purchase.source_candidate_id === pending.candidate_id), false);
});

test("promotion copies canonical candidate values unchanged into the immutable purchase record", () => {
  const purchase = result.purchases[0];
  const candidate = result.candidates.find((item) => item.candidate_id === purchase.source_candidate_id);
  assert.ok(candidate);

  assert.equal(purchase.canonical_item_id, candidate.canonical_item_id);
  assert.equal(purchase.quantity, candidate.quantity);
  assert.equal(purchase.unit, candidate.unit);
  assert.equal(purchase.amount, candidate.amount);
  assert.equal(purchase.supersedes_id, null);
});

test("receipt reconciliation explains authoritative, pending-review, and non-inventory amounts without treating totals as stock", () => {
  assert.deepEqual(result.reconciliation, {
    receipt_total: 7.41,
    authoritative_amount: 4,
    pending_review_amount: 3,
    non_inventory_adjustments: 0.41,
    accounted_amount: 7.41,
    difference: 0,
  });
});

test("stock is a deterministic conservative decay estimate derived only from authoritative purchases", () => {
  assert.equal(result.stockSnapshots.length, 1);
  const snapshot = result.stockSnapshots[0];
  assert.equal(snapshot.canonical_item_id, "item_moon_pear");
  assert.equal(snapshot.state, "low");
  assert.equal(snapshot.quantity_estimate, 0.3299);
  assert.deepEqual(snapshot.source_purchase_ids, [result.purchases[0].purchase_id]);

  const rerun = runSyntheticVerticalSlice(fixture);
  assert.deepEqual(rerun.stockSnapshots, result.stockSnapshots);
});

test("budget export is deterministic and contains only authoritative purchase spend", () => {
  assert.deepEqual(result.budgetExport.rows, [
    {
      category: "groceries_food",
      amount: 4,
      purchase_ids: [result.purchases[0].purchase_id],
    },
  ]);
  assert.equal(result.budgetExport.total_amount, 4);
  assert.equal(result.budgetExport.period, "2026-01");

  const pending = result.candidates.find((candidate) => candidate.review_state === "needs_review");
  assert.ok(pending);
  assert.equal(result.budgetExport.rows.some((row) => row.purchase_ids.includes(pending.candidate_id)), false);
});

test("shopping recommendation is explainable and cites only authoritative/derived evidence", () => {
  assert.equal(result.recommendations.length, 1);
  const recommendation = result.recommendations[0];
  const snapshot = result.stockSnapshots[0];

  assert.equal(recommendation.canonical_item_id, "item_moon_pear");
  assert.equal(recommendation.action, "buy");
  assert.equal(recommendation.urgency, "medium");
  assert.deepEqual(recommendation.reason_codes, ["estimated_low_stock"]);
  assert.equal(recommendation.evidence.stock_snapshot_id, snapshot.snapshot_id);
  assert.deepEqual(recommendation.evidence.purchase_ids, snapshot.source_purchase_ids);
  assert.match(recommendation.rationale, /Estimated stock is low/);

  const serialized = JSON.stringify(recommendation);
  assert.doesNotMatch(serialized, /ORBIT MARKET|MYST HERB|SYNTHETIC DEPOSIT|SYNTHETIC TAX/i);
});

test("the complete synthetic flow is deterministic", () => {
  assert.deepEqual(runSyntheticVerticalSlice(fixture), result);
});
