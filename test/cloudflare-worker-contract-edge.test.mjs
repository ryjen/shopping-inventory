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

test("structured intake rejects pathological line counts while allowing realistic large receipts", () => {
  const line = fixture.envelope.lines[0];
  const oversized = {
    ...fixture.envelope,
    lines: Array.from({ length: 501 }, (_, index) => ({
      ...line,
      line_id: `line_syn_limit_${index + 1}`,
      line_number: index + 1,
    })),
  };

  assert.deepEqual(validateReceiptExtractionEnvelope(oversized), ["lines"]);
});
