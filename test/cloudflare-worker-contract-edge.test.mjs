import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { validateReceiptExtractionEnvelope } from "../src/worker.mjs";

const fixture = JSON.parse(await readFile(
  new URL("../evaluation/fixtures/canonical-receipt-v1.synthetic.json", import.meta.url),
  "utf8",
));

test("structured intake rejects calendar-impossible RFC3339-shaped timestamps", () => {
  const impossible = {
    ...fixture.envelope,
    extracted_at: "2026-02-31T18:00:00Z",
  };

  assert.deepEqual(validateReceiptExtractionEnvelope(impossible), ["extracted_at"]);
});
