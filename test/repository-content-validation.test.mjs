import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

import {
  parseCsv,
  validateMarkdownLinks,
  validateStructuredFixtureText,
} from "../scripts/repository-content-check.mjs";

test("CSV parser handles quoted commas and escaped quotes", () => {
  assert.deepEqual(parseCsv('id,name\n1,"Milk, 2%"\n2,"A ""quoted"" item"\n'), [
    ["id", "name"],
    ["1", "Milk, 2%"],
    ["2", 'A "quoted" item'],
  ]);
});

test("synthetic JSONL requires explicit content markers", () => {
  const missing = validateStructuredFixtureText(
    "evaluation/fixtures/example.synthetic.jsonl",
    '{"case_id":"one"}\n',
  );
  assert.deepEqual(missing.violations, ["missing-synthetic-marker"]);

  const valid = validateStructuredFixtureText(
    "evaluation/fixtures/example.synthetic.jsonl",
    '{"synthetic":true,"case_id":"one"}\n',
  );
  assert.deepEqual(valid.violations, []);
  assert.deepEqual(valid.ids, [{ key: "case_id", value: "one" }]);
});

test("synthetic CSV requires marker column and consistent rows", () => {
  const valid = validateStructuredFixtureText(
    "evaluation/fixtures/example.synthetic.csv",
    "synthetic,alias_id,name\ntrue,a1,Example\n",
  );
  assert.deepEqual(valid.violations, []);
  assert.deepEqual(valid.ids, [{ key: "alias_id", value: "a1" }]);

  const invalid = validateStructuredFixtureText(
    "evaluation/fixtures/example.synthetic.csv",
    "alias_id,name\na1,Example,extra\n",
  );
  assert.deepEqual(invalid.violations.sort(), ["invalid-csv-row-width", "missing-synthetic-marker"]);
});

test("relative Markdown links are checked without network access", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "shopping-links-"));
  await mkdir(path.join(root, "docs"));
  await writeFile(path.join(root, "docs", "target.md"), "# Target\n");

  assert.deepEqual(
    await validateMarkdownLinks("README.md", "[ok](docs/target.md) [web](https://example.com)", root),
    [],
  );
  assert.deepEqual(
    await validateMarkdownLinks("README.md", "[missing](docs/missing.md)", root),
    ["broken-relative-link"],
  );
});
