#!/usr/bin/env node

import { readFile } from "node:fs/promises";
import { evaluateSemanticCases } from "../src/evaluation/semantic-baseline.mjs";

const base = new URL("../evaluation/fixtures/", import.meta.url);
const catalog = JSON.parse(await readFile(new URL("semantic-catalog.synthetic.json", base), "utf8"));
const fixtureText = await readFile(new URL("semantic-items.synthetic.jsonl", base), "utf8");
const cases = fixtureText.trim().split(/\r?\n/).map((line) => JSON.parse(line));
const report = evaluateSemanticCases(cases, catalog);

// Intentionally aggregated and source-payload-free output.
process.stdout.write(JSON.stringify(report, null, 2) + "\n");
