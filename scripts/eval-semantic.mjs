#!/usr/bin/env node

import { readFile } from "node:fs/promises";
import { evaluateSemanticCases } from "../src/evaluation/semantic-baseline.mjs";
import { createSyntheticReplay } from "../src/evaluation/semantic-replay.mjs";

const base = new URL("../evaluation/fixtures/", import.meta.url);
const catalog = JSON.parse(await readFile(new URL("semantic-catalog.synthetic.json", base), "utf8"));
const loadJsonl = async (name) =>
  (await readFile(new URL(name, base), "utf8")).trim().split(/\r?\n/).map((line) => JSON.parse(line));
const cases = [
  ...await loadJsonl("semantic-items.synthetic.jsonl"),
  ...await loadJsonl("semantic-expansion.synthetic.jsonl"),
];
const args = process.argv.slice(2);
if (args.length > 1 || (args.length === 1 && args[0] !== "--replay")) {
  throw new TypeError("usage: npm run eval:semantic [-- --replay]");
}

let report;
if (args[0] === "--replay") {
  const bundle = JSON.parse(await readFile(new URL("semantic-scripted-replay.synthetic.json", base), "utf8"));
  const replay = createSyntheticReplay(bundle, cases, catalog);
  report = {
    mode: "synthetic-scripted-test-double",
    warning: "Invented scripted predictions for harness verification only; no Jev/local model was run.",
    availableCases: cases.length,
    comparedCases: replay.cases.length,
    exactAlias: evaluateSemanticCases(replay.cases, catalog),
    scripted: evaluateSemanticCases(replay.cases, catalog, replay.decide),
  };
} else {
  report = evaluateSemanticCases(cases, catalog);
}

// Intentionally aggregated and source-payload-free output; no model calls or private data.
process.stdout.write(JSON.stringify(report, null, 2) + "\n");
