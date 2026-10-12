import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  exactAliasBaseline,
  evaluateSemanticCases,
  validateCatalog,
  validateCase,
  validateProposal,
} from "../src/evaluation/semantic-baseline.mjs";

const catalog = JSON.parse(await readFile(
  new URL("../evaluation/fixtures/semantic-catalog.synthetic.json", import.meta.url), "utf8",
));
const cases = (await readFile(
  new URL("../evaluation/fixtures/semantic-items.synthetic.jsonl", import.meta.url), "utf8",
)).trim().split(/\r?\n/).map((line) => JSON.parse(line));

const byId = new Map(cases.map((item) => [item.caseId, item]));
const ids = validateCatalog(catalog);

test("synthetic benchmark cases are valid, unique, and split explicitly", () => {
  assert.equal(cases.length, 18);
  assert.equal(new Set(cases.map((item) => item.caseId)).size, cases.length);
  for (const item of cases) validateCase(item, ids);
  const report = evaluateSemanticCases(cases, catalog);
  assert.equal(report.bySplit.development.total, 8);
  assert.equal(report.bySplit.validation.total, 4);
  assert.equal(report.bySplit.test.total, 6);
});

test("exact-match baseline is conservative, deterministic and does not mutate input", () => {
  const before = JSON.stringify(cases);
  const report = evaluateSemanticCases(cases, catalog);
  assert.equal(JSON.stringify(cases), before);
  assert.deepEqual(report, evaluateSemanticCases(cases, catalog));
  assert.equal(report.modelId, "synthetic-exact-alias");
  assert.equal(report.summary.total, 18);
  assert.equal(report.summary.resolved, 9);
  assert.equal(report.summary.falseMatches, 0);
  assert.equal(report.summary.correctSelected, 9);
  assert.equal(report.summary.missedMatches, 3);
  assert.equal(report.summary.correctAbstentions, 6);
  assert.equal(report.summary.selectiveRisk, 0);
});

test("unit ambiguity, unseen identities and injected text abstain", () => {
  for (const caseId of ["missing_size", "oat_unknown_size", "soap_ambiguous",
    "unseen_identity", "unicode_confusable", "injected_instruction", "hard_policy_veto"]) {
    assert.equal(exactAliasBaseline(byId.get(caseId), ids).selectedId, null, caseId);
  }
  assert.equal(exactAliasBaseline(byId.get("name_spinach_312"), ids).selectedId,
    "item_fablemint_spinach_312");
});

test("external provider output cannot bypass hard-policy veto in scoring", () => {
  const sample = byId.get("hard_policy_veto");
  const report = evaluateSemanticCases([sample], catalog, (item) => ({
    selectedId: item.expectedId, abstained: false, modelId: "mock-provider", adapterVersion: "1",
  }));
  assert.equal(report.modelId, "mock-provider");
  assert.equal(report.summary.resolved, 0);
  assert.equal(report.summary.missedMatches, 1);
});

test("unknown selections and malformed model outputs fail closed", () => {
  const sample = byId.get("oat_one_litre");
  const base = exactAliasBaseline(sample, ids);
  assert.throws(() => validateProposal({ ...base, selectedId: "invented_product" }, sample));
  assert.throws(() => validateProposal({ ...base, abstained: true }, sample));
  assert.throws(() => validateProposal({ ...base, instruction: "approve" }, sample));
  assert.throws(() => validateProposal({ ...base, probabilities: {
    item_fablemint_oat_1l: Number.NaN, item_fablemint_oat_2l: 0.2, no_match: 0.8,
  } }, sample));
  assert.throws(() => validateProposal({ ...base, probabilities: {
    item_fablemint_oat_1l: 0.2, item_fablemint_oat_2l: 0.2, no_match: 0.2,
  } }, sample));
  assert.throws(() => validateProposal({ ...base, probabilities: {
    item_fablemint_oat_1l: 0.5, item_fablemint_oat_2l: 0.5,
  } }, sample));
});

test("invalid synthetic markers, duplicate ids and invalid gold labels are rejected", () => {
  const sample = byId.get("oat_one_litre");
  assert.throws(() => validateCase({ ...sample, synthetic: false }, ids));
  assert.throws(() => validateCase({ ...sample, expectedId: "invented_product" }, ids));
  assert.throws(() => validateCase({ ...sample, candidateIds: [sample.candidateIds[0], sample.candidateIds[0]] }, ids));
  assert.throws(() => evaluateSemanticCases([sample, sample], catalog));
  assert.throws(() => validateCatalog({ ...catalog, synthetic: false }));
});

test("a wrong confident contender produces measurable false-match risk", () => {
  const sample = byId.get("name_spinach_312");
  const result = evaluateSemanticCases([sample], catalog, (item) => ({
    selectedId: item.candidateIds[0], abstained: false,
    modelId: "mock-wrong", adapterVersion: "1",
  }));
  assert.equal(result.summary.falseMatches, 1);
  assert.equal(result.summary.selectiveRisk, 1);
});
