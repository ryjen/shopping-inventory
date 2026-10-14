import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { validateSemanticPartition } from "../src/evaluation/semantic-partition.mjs";

const base = new URL("../evaluation/fixtures/", import.meta.url);
const jsonl = async (name) =>
  (await readFile(new URL(name, base), "utf8")).trim().split(/\r?\n/).map(JSON.parse);
const cases = [
  ...await jsonl("semantic-items.synthetic.jsonl"),
  ...await jsonl("semantic-expansion.synthetic.jsonl"),
];
const catalog = JSON.parse(await readFile(new URL("semantic-catalog.synthetic.json", base), "utf8"));
const manifest = JSON.parse(await readFile(new URL("semantic-split-v2.synthetic.json", base), "utf8"));
const check = (items = cases, selectedManifest = manifest) =>
  validateSemanticPartition(items, catalog, selectedManifest);

test("versioned synthetic held-out partition is globally case-family disjoint", () => {
  const result = check();
  assert.equal(result.schemaVersion, 2);
  assert.equal(result.partitionKind, "case-family-disjoint");
  assert.equal(result.cases, 50);
  assert.equal(result.catalogItems, 22);
  assert.deepEqual(result.splitCounts, { development: 17, validation: 16, test: 17 });
  assert.equal(result.frozenTestCases, 17);
  assert.equal(Object.keys(result.familyCounts).length, 10);
  assert.equal(Object.values(result.familyCounts).reduce((a, b) => a + b, 0), 50);
  assert.deepEqual(check(), result);
});

test("held-out gold, raw text, candidate order, flags and membership cannot drift", () => {
  for (const change of [
    (items) => { items.find((c) => c.caseId === "soap_citrus").rawLine += " altered"; },
    (items) => { items.find((c) => c.caseId === "soap_citrus").expectedId = null; },
    (items) => { items.find((c) => c.caseId === "soap_citrus").candidateIds.reverse(); },
    (items) => { items.find((c) => c.caseId === "soap_citrus").hardFlags.push("review_required"); },
    (items) => { items.find((c) => c.caseId === "soap_citrus").cohort = "changed"; },
    (items) => { items.splice(items.findIndex((c) => c.caseId === "soap_citrus"), 1); },
    (items) => { items.find((c) => c.caseId === "soap_citrus").split = "development"; },
  ]) {
    const changed = structuredClone(cases);
    change(changed);
    assert.throws(() => check(changed));
  }
});

test("family reassignment or manifest tampering cannot launder leakage", () => {
  const casesWithMovedFamily = structuredClone(cases);
  casesWithMovedFamily.find((c) => c.caseId === "oat_one_litre").split = "test";
  assert.throws(() => check(casesWithMovedFamily));

  const casesWithWrongGoldGroup = structuredClone(cases);
  casesWithWrongGoldGroup.find((c) => c.caseId === "oat_one_litre").familyId = "greens";
  assert.throws(() => check(casesWithWrongGoldGroup));

  const casesWithUnknownFamily = structuredClone(cases);
  casesWithUnknownFamily.find((c) => c.caseId === "oat_one_litre").familyId = "unregistered_family";
  assert.throws(() => check(casesWithUnknownFamily));

  const missingFamily = structuredClone(manifest);
  delete missingFamily.catalogItemFamilies.item_fablemint_oat_1l;
  assert.throws(() => check(cases, missingFamily));

  const reclassifiedGold = structuredClone(manifest);
  reclassifiedGold.catalogItemFamilies.item_fablemint_oat_1l = "greens";
  assert.throws(() => check(cases, reclassifiedGold));

  const missingSnapshot = structuredClone(manifest);
  missingSnapshot.frozenTestCases.pop();
  assert.throws(() => check(cases, missingSnapshot));

  const extraSnapshot = structuredClone(manifest);
  extraSnapshot.frozenTestCases.push(structuredClone(extraSnapshot.frozenTestCases[0]));
  assert.throws(() => check(cases, extraSnapshot));
});

test("cross-split duplicate inputs and wrong-family no-match shortlists are rejected", () => {
  const duplicateRaw = structuredClone(cases);
  duplicateRaw.find((c) => c.caseId === "alias_spinach_142").rawLine = "FAB CITRUS SOAP";
  assert.throws(() => check(duplicateRaw));

  const wrongGroup = structuredClone(cases);
  wrongGroup.find((c) => c.caseId === "exp_flour_missing_size").candidateIds =
    ["item_demovale_juice_pulp", "item_demovale_juice_nopulp"];
  assert.throws(() => check(wrongGroup));
});

test("CLI evaluates only after manifest validation, exposing aggregate partition metadata", () => {
  const script = new URL("../scripts/eval-semantic.mjs", import.meta.url).pathname;
  const report = JSON.parse(execFileSync(process.execPath, [script], { encoding: "utf8" }));
  const replay = JSON.parse(execFileSync(process.execPath, [script, "--replay"], { encoding: "utf8" }));
  assert.deepEqual(report.partition.splitCounts, { development: 17, validation: 16, test: 17 });
  assert.equal(report.partition.frozenTestCases, 17);
  assert.deepEqual(replay.partition, report.partition);
  assert.equal(report.summary.total, 50);
  assert.equal(replay.comparedCases, 10);
  assert.doesNotMatch(JSON.stringify(report), /FAB CITRUS SOAP|DemoVale Whole Wheat Flour/);
});
