import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { evaluateSemanticCases, validateCatalog, exactAliasBaseline } from "../src/evaluation/semantic-baseline.mjs";
import { diceScore, LEXICAL_CONFIG, lexicalDiceBaseline } from "../src/evaluation/lexical-baseline.mjs";
import { validateSemanticPartitionEvolution } from "../src/evaluation/semantic-partition.mjs";

const base = new URL("../evaluation/fixtures/", import.meta.url);
const json = async (path) => JSON.parse(await readFile(new URL(path, base), "utf8"));
const jsonl = async (path) =>
  (await readFile(new URL(path, base), "utf8")).trim().split(/\r?\n/).map(JSON.parse);
const previous = [
  ...await jsonl("semantic-items.synthetic.jsonl"),
  ...await jsonl("semantic-expansion.synthetic.jsonl"),
];
const cases = [...previous, ...await jsonl("semantic-more-v3.synthetic.jsonl")];
const previousCatalog = await json("semantic-catalog.synthetic.json");
const catalog = await json("semantic-catalog-v3.synthetic.json");
const previousManifest = await json("semantic-split-v2.synthetic.json");
const manifest = await json("semantic-split-v3.synthetic.json");
const byId = new Map(cases.map((item) => [item.caseId, item]));
const catalogById = validateCatalog(catalog);

test("trigram similarity is symmetric, bounded, deterministic and NFKC-normalized", () => {
  assert.equal(diceScore("CP COFF GRND 340", "cp   coff grnd 340"), 1);
  assert.equal(diceScore("CP RICE JASM 1KG", "CP RICE JASM 1KG"), 1);
  for (const [a, b] of [["ABCD", "WXYZ"], ["abc", "abc "], ["CP OAT", "CP OAT 1L"]]) {
    assert.equal(diceScore(a, b), diceScore(b, a));
    assert.ok(diceScore(a, b) >= 0 && diceScore(a, b) <= 1);
  }
  assert.equal(LEXICAL_CONFIG.minScore, 0.88);
  assert.equal(LEXICAL_CONFIG.minMargin, 0.10);
  assert.throws(() => diceScore(null, "x"));
});

test("lexical contender binds to supplied shortlist, abstains on missing catalog and policy vetoes", () => {
  const item = byId.get("v3_coffee_ground_alias");
  assert.equal(lexicalDiceBaseline(item, catalogById).selectedId, item.expectedId);
  assert.equal(exactAliasBaseline(item, catalogById).selectedId, item.expectedId);
  for (const id of ["v3_coffee_instruction", "v3_rice_hard_veto",
    "v3_soup_flagged", "v3_detergent_flagged", "v3_cereal_flavor_missing"]) {
    assert.equal(lexicalDiceBaseline(byId.get(id), catalogById).selectedId, null, id);
  }
  const unreachable = byId.get("v3_coffee_lost_retrieval");
  assert.ok(!unreachable.candidateIds.includes(unreachable.expectedId));
  assert.notEqual(lexicalDiceBaseline(unreachable, catalogById).selectedId, unreachable.expectedId);
});

test("lexical output is deterministic across candidate permutations and does not mutate input", () => {
  const sample = byId.get("v3_rice_jasmine_1_alias");
  const saved = JSON.stringify(sample);
  const original = lexicalDiceBaseline(sample, catalogById);
  const reversed = lexicalDiceBaseline({ ...sample, candidateIds: [...sample.candidateIds].reverse() }, catalogById);
  assert.deepEqual(original, reversed);
  assert.equal(JSON.stringify(sample), saved);
});

test("both computed baselines score the same frozen 100-case partition without source payloads", () => {
  const partition = validateSemanticPartitionEvolution(previous, previousCatalog, previousManifest,
    cases, catalog, manifest);
  assert.equal(partition.frozenTestCases, 37);
  const first = evaluateSemanticCases(cases, catalog);
  const second = evaluateSemanticCases(cases, catalog, lexicalDiceBaseline);
  assert.equal(first.summary.total, 100);
  assert.equal(second.summary.total, 100);
  assert.equal(second.modelId, "synthetic-lexical-dice");
  assert.equal(second.summary.retrievalMisses, first.summary.retrievalMisses);
  assert.equal(second.summary.knownTargets, first.summary.knownTargets);
  assert.deepEqual(second, evaluateSemanticCases(cases, catalog, lexicalDiceBaseline));
  for (const part of ["development", "validation", "test"]) {
    assert.equal(first.bySplit[part].total, second.bySplit[part].total);
  }
});

test("CLI lexical mode returns aggregate comparisons with fixed config, never individual lines", () => {
  const script = new URL("../scripts/eval-semantic.mjs", import.meta.url).pathname;
  const report = JSON.parse(execFileSync(process.execPath, [script, "--lexical"], { encoding: "utf8" }));
  assert.equal(report.mode, "offline-deterministic-lexical-comparison");
  assert.equal(report.exactAlias.summary.total, 100);
  assert.equal(report.lexical.summary.total, 100);
  assert.equal(report.partition.frozenTestCases, 37);
  assert.equal(report.configuration.minScore, 0.88);
  assert.equal(report.configuration.minMargin, 0.10);
  assert.match(report.warning, /not a trained model/);
  assert.doesNotMatch(JSON.stringify(report), /Cloudpine|FAB SPIN 142|CP RICE/);
  assert.deepEqual(report, JSON.parse(execFileSync(process.execPath, [script, "--lexical"], { encoding: "utf8" })));
});
