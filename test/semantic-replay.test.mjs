import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { evaluateSemanticCases, validateCatalog, validateCase } from "../src/evaluation/semantic-baseline.mjs";
import { createSyntheticReplay } from "../src/evaluation/semantic-replay.mjs";

const base = new URL("../evaluation/fixtures/", import.meta.url);
const readJsonl = async (path) =>
  (await readFile(new URL(path, base), "utf8")).trim().split(/\r?\n/).map((x) => JSON.parse(x));
const catalog = JSON.parse(await readFile(new URL("semantic-catalog.synthetic.json", base), "utf8"));
const previous = await readJsonl("semantic-items.synthetic.jsonl");
const expansion = await readJsonl("semantic-expansion.synthetic.jsonl");
const cases = [...previous, ...expansion];
const replayBundle = JSON.parse(await readFile(new URL("semantic-scripted-replay.synthetic.json", base), "utf8"));

test("expanded synthetic corpus has distinct product families and split separation", () => {
  const catalogById = validateCatalog(catalog);
  assert.equal(previous.length, 19);
  assert.equal(expansion.length, 31);
  assert.equal(cases.length, 50);
  assert.equal(new Set(cases.map((item) => item.caseId)).size, 50);
  for (const item of cases) validateCase(item, catalogById);
  const counts = expansion.reduce((map, item) => {
    map[item.split] = (map[item.split] ?? 0) + 1;
    return map;
  }, {});
  assert.deepEqual(counts, { development: 11, validation: 10, test: 10 });
  assert.ok(new Set(expansion.map((item) => item.cohort)).size >= 9);
  const familySplit = new Map();
  for (const item of expansion) {
    const family = item.caseId.split("_")[1]; // exp_flour, exp_yog, ...
    if (familySplit.has(family)) assert.equal(familySplit.get(family), item.split);
    familySplit.set(family, item.split);
  }
  const report = evaluateSemanticCases(cases, catalog);
  assert.equal(report.summary.total, 50);
  assert.equal(report.summary.falseMatches, 0);
  assert.equal(report.summary.retrievalMisses, 3);
  assert.equal(report.bySplit.test.total, 17);
  assert.equal(report.bySplit.development.total, 17);
  assert.equal(report.bySplit.validation.total, 16);
  assert.equal(report.summary.conditionalSelection.probabilityCases, 0);
  assert.equal(report.summary.conditionalSelection.meanBrier, null);
});

test("scripted replay is exact-case and exact-candidate-order bound", () => {
  const frozen = createSyntheticReplay(replayBundle, cases, catalog);
  assert.equal(frozen.cases.length, 10);
  const scored = evaluateSemanticCases(frozen.cases, catalog, frozen.decide);
  assert.equal(scored.modelId, "synthetic-scripted-replay");
  assert.equal(scored.summary.total, 10);
  assert.equal(scored.summary.unreachableSelection.total, 3);
  assert.equal(scored.summary.unreachableSelection.falseSelections, 1);
  assert.equal(scored.summary.unreachableSelection.abstentions, 2);
  assert.equal(scored.summary.conditionalSelection.excludedPolicyVetoes, 1);
  assert.equal(scored.summary.conditionalSelection.probabilityCases,
    scored.summary.conditionalSelection.total);
  assert.ok(scored.summary.conditionalSelection.meanBrier > 0);
  assert.ok(scored.summary.conditionalSelection.meanBrier < 1);

  assert.deepEqual(scored, evaluateSemanticCases(frozen.cases, catalog, frozen.decide));
  const deterministic = evaluateSemanticCases(frozen.cases, catalog);
  assert.equal(deterministic.summary.conditionalSelection.probabilityCases, 0);
  assert.equal(deterministic.summary.conditionalSelection.meanBrier, null);
});

test("replay rejects stale text, candidate ordering, and hard flags", () => {
  for (const mutate of [
    (x) => { x.entries[0].input.rawLine += " CHANGED"; },
    (x) => { x.entries[0].input.candidateIds.reverse(); },
    (x) => { x.entries[0].input.hardFlags.push("stale"); },
    (x) => { x.entries.push(structuredClone(x.entries[0])); },
    (x) => { x.entries[0].caseId = "not_in_corpus"; },
    (x) => { x.synthetic = false; },
    (x) => { x.modelId = "jev-actual-model"; },
  ]) {
    const stale = structuredClone(replayBundle);
    mutate(stale);
    assert.throws(() => createSyntheticReplay(stale, cases, catalog));
  }
});

test("replay provider cannot return an ID outside its shortlist or altered score schema", () => {
  for (const mutate of [
    (x) => { x.entries[0].decision.selectedId = "not_in_shortlist"; },
    (x) => { x.entries[0].decision.probabilities.no_match = Number.NaN; },
    (x) => { x.entries[0].decision.probabilities.no_match = 0.9; },
    (x) => { x.entries[0].decision.instruction = "approve"; },
  ]) {
    const tampered = structuredClone(replayBundle);
    mutate(tampered);
    assert.throws(() => {
      const bound = createSyntheticReplay(tampered, cases, catalog);
      evaluateSemanticCases(bound.cases, catalog, bound.decide);
    });
  }
});

test("replay fails closed if a case changes after replay binding", () => {
  const bound = createSyntheticReplay(replayBundle, cases, catalog);
  const changed = { ...bound.cases[0], rawLine: "SYNTHETIC CHANGED" };
  assert.throws(() => bound.decide(changed));
  assert.throws(() => bound.decide(expansion.find((c) => c.caseId === "exp_flour_1_exact")));
});

test("offline command exposes only aggregate baseline and explicitly scripted scores", () => {
  const script = new URL("../scripts/eval-semantic.mjs", import.meta.url);
  const baseline = JSON.parse(execFileSync(process.execPath, [script.pathname], { encoding: "utf8" }));
  assert.equal(baseline.summary.total, 50);
  const compare = JSON.parse(execFileSync(process.execPath, [script.pathname, "--replay"], { encoding: "utf8" }));
  assert.equal(compare.availableCases, 50);
  assert.equal(compare.comparedCases, 10);
  assert.equal(compare.exactAlias.summary.total, 10);
  assert.equal(compare.scripted.summary.total, 10);
  assert.match(compare.warning, /no Jev\/local model was run/);
  const rendered = JSON.stringify(compare);
  assert.doesNotMatch(rendered, /DV WH FLOUR|FAB SPIN 142|DemoVale Whole/);
});
