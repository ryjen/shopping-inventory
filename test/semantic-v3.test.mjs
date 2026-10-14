import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { evaluateSemanticCases } from "../src/evaluation/semantic-baseline.mjs";
import {
  validateSemanticPartitionEvolution,
  validateSemanticPartition,
} from "../src/evaluation/semantic-partition.mjs";

const base = new URL("../evaluation/fixtures/", import.meta.url);
const json = async (name) => JSON.parse(await readFile(new URL(name, base), "utf8"));
const jsonl = async (name) =>
  (await readFile(new URL(name, base), "utf8")).trim().split(/\r?\n/).map(JSON.parse);
const parentCatalog = await json("semantic-catalog.synthetic.json");
const catalog = await json("semantic-catalog-v3.synthetic.json");
const parentCases = [
  ...await jsonl("semantic-items.synthetic.jsonl"),
  ...await jsonl("semantic-expansion.synthetic.jsonl"),
];
const extensionCases = await jsonl("semantic-more-v3.synthetic.jsonl");
const allCases = [...parentCases, ...extensionCases];
const parentManifest = await json("semantic-split-v2.synthetic.json");
const manifest = await json("semantic-split-v3.synthetic.json");
const check = (
  old = parentCases, previousCatalog = parentCatalog, previousManifest = parentManifest,
  current = allCases, fullCatalog = catalog, fullManifest = manifest,
) => validateSemanticPartitionEvolution(old, previousCatalog, previousManifest,
  current, fullCatalog, fullManifest);

test("100-case synthetic version 3 corpus is partitioned by 15 explicit families", () => {
  assert.equal(parentCases.length, 50);
  assert.equal(extensionCases.length, 50);
  assert.equal(catalog.items.length, 37);
  assert.equal(new Set(allCases.map((item) => item.caseId)).size, 100);
  assert.equal(new Set(extensionCases.map((item) => item.familyId)).size, 5);

  const evidence = check();
  assert.equal(evidence.parentVersion, 2);
  assert.equal(evidence.parentCases, 50);
  assert.equal(evidence.parentFrozenTestCases, 17);
  assert.equal(evidence.schemaVersion, 3);
  assert.equal(evidence.cases, 100);
  assert.equal(evidence.catalogItems, 37);
  assert.equal(evidence.frozenTestCases, 37);
  assert.equal(Object.keys(evidence.familyCounts).length, 15);
  assert.deepEqual(evidence.splitCounts, { development: 37, validation: 26, test: 37 });
  assert.equal(extensionCases.filter((item) => item.split === "test").length, 20);
  assert.deepEqual(check(), evidence);
});

test("v3 never changes any v2 source identity or case, even in development", () => {
  const movedDevelopment = structuredClone(allCases);
  movedDevelopment.find((item) => item.caseId === "alias_spinach_142").rawLine += " mutated";
  assert.throws(() => check(parentCases, parentCatalog, parentManifest, movedDevelopment));

  const changedCatalog = structuredClone(catalog);
  changedCatalog.items.find((item) => item.id === "item_fablemint_oat_1l")
    .aliases.push("INVALID ALTERATION");
  assert.throws(() => check(parentCases, parentCatalog, parentManifest,
    allCases, changedCatalog));

  const changedMapping = structuredClone(manifest);
  changedMapping.catalogItemFamilies.item_fablemint_oat_1l = "coffee";
  assert.throws(() => check(parentCases, parentCatalog, parentManifest,
    allCases, catalog, changedMapping));
});

test("v3 rejects drift of new held-out gold, flags, shortlists and snapshots", () => {
  for (const mutate of [
    (items) => { items.find((x) => x.caseId === "v3_cereal_oat_450_alias").rawLine += " changed"; },
    (items) => { items.find((x) => x.caseId === "v3_cereal_oat_450_alias").expectedId = null; },
    (items) => { items.find((x) => x.caseId === "v3_cereal_oat_450_alias").hardFlags.push("veto"); },
    (items) => { items.find((x) => x.caseId === "v3_cereal_oat_450_alias").candidateIds.reverse(); },
    (items) => { items.find((x) => x.caseId === "v3_cereal_oat_450_alias").split = "validation"; },
    (items) => { items.splice(items.findIndex((x) => x.caseId === "v3_cereal_oat_450_alias"), 1); },
  ]) {
    const changed = structuredClone(allCases);
    mutate(changed);
    assert.throws(() => check(parentCases, parentCatalog, parentManifest, changed));
  }

  const altered = structuredClone(manifest);
  altered.frozenTestCases.pop();
  assert.throws(() => check(parentCases, parentCatalog, parentManifest,
    allCases, catalog, altered));
  const extra = structuredClone(manifest);
  extra.frozenTestCases.push(structuredClone(extra.frozenTestCases[0]));
  assert.throws(() => check(parentCases, parentCatalog, parentManifest,
    allCases, catalog, extra));
});

test("v3 preserves retrieval misses, policy vetoes and conservative exact-alias scoring", () => {
  const evidence = validateSemanticPartition(allCases, catalog, manifest);
  assert.equal(evidence.cases, 100);
  const report = evaluateSemanticCases(allCases, catalog);
  assert.equal(report.summary.total, 100);
  assert.equal(report.summary.falseMatches, 0);
  assert.equal(report.summary.retrievalMisses, 8);
  assert.equal(report.bySplit.test.total, 37);
  assert.ok(report.byCohort.no_match.correctAbstentions > 0);
  assert.ok(report.byCohort.hard_policy.resolved === 0);
});

test("CLI reports v3 partition and offline scripted replay without exposing source text", () => {
  const script = new URL("../scripts/eval-semantic.mjs", import.meta.url).pathname;
  const baseline = JSON.parse(execFileSync(process.execPath, [script], { encoding: "utf8" }));
  const replay = JSON.parse(execFileSync(process.execPath,
    [script, "--replay"], { encoding: "utf8" }));
  assert.equal(baseline.summary.total, 100);
  assert.equal(baseline.partition.parentVersion, 2);
  assert.equal(baseline.partition.frozenTestCases, 37);
  assert.deepEqual(baseline.partition.splitCounts,
    { development: 37, validation: 26, test: 37 });
  assert.equal(replay.availableCases, 100);
  assert.equal(replay.comparedCases, 10);
  assert.deepEqual(replay.partition, baseline.partition);
  assert.doesNotMatch(JSON.stringify(baseline), /Cloudpine|FAB SPIN 142|CP CEREAL/);
});
