import assert from "node:assert/strict";
import test from "node:test";

import worker, { receiptObjectKey } from "../src/worker.mjs";

function env(overrides = {}) {
  return {
    API_TOKEN: "test-token",
    ENVIRONMENT: "test",
    RECEIPTS: { put: async () => {}, get: async () => null },
    DB: {
      prepare: () => ({
        bind: () => ({ run: async () => ({ success: true }), first: async () => null }),
      }),
    },
    ...overrides,
  };
}

test("rejects requests without the bearer token", async () => {
  const response = await worker.fetch(new Request("https://example.test/health"), env());
  assert.equal(response.status, 401);
});

test("health response is private behind authentication", async () => {
  const request = new Request("https://example.test/health", {
    headers: { authorization: "Bearer test-token" },
  });
  const response = await worker.fetch(request, env());
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { status: "ok", environment: "test" });
});

test("receipt object keys contain only opaque identifiers", () => {
  assert.equal(receiptObjectKey("receipt_123", "evidence_456"), "receipts/receipt_123/evidence_456");
  assert.throws(() => receiptObjectKey("Safeway Lynn Valley", "2026-08-03"));
});

test("rejects unsupported upload types before writing", async () => {
  const request = new Request("https://example.test/v1/receipts", {
    method: "POST",
    headers: { authorization: "Bearer test-token", "content-type": "text/plain" },
    body: "private data",
  });
  const response = await worker.fetch(request, env());
  assert.equal(response.status, 415);
});
