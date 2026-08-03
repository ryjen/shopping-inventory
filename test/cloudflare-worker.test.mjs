import assert from "node:assert/strict";
import test from "node:test";

import worker, { receiptObjectKey } from "../src/worker.mjs";

function env(overrides = {}) {
  return {
    API_TOKEN: "test-token",
    ENVIRONMENT: "test",
    RECEIPTS: {
      put: async () => {},
      get: async () => null,
      delete: async () => {},
    },
    DB: {
      prepare: () => ({
        bind: () => ({ run: async () => ({ success: true }), first: async () => null }),
      }),
    },
    ...overrides,
  };
}

function authorizedRequest(path, init = {}) {
  return new Request(`https://example.test${path}`, {
    ...init,
    headers: { authorization: "Bearer test-token", ...(init.headers ?? {}) },
  });
}

test("rejects requests without the bearer token", async () => {
  const response = await worker.fetch(new Request("https://example.test/health"), env());
  assert.equal(response.status, 401);
  assert.equal(response.headers.get("cache-control"), "private, no-store");
});

test("health response is private behind authentication", async () => {
  const response = await worker.fetch(authorizedRequest("/health"), env());
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { status: "ok", environment: "test" });
});

test("receipt object keys contain only opaque identifiers", () => {
  assert.equal(receiptObjectKey("receipt_123", "evidence_456"), "receipts/receipt_123/evidence_456");
  assert.throws(() => receiptObjectKey("Safeway Lynn Valley", "2026-08-03"));
});

test("rejects unsupported upload types before writing", async () => {
  let writes = 0;
  const response = await worker.fetch(
    authorizedRequest("/v1/receipts", {
      method: "POST",
      headers: { "content-type": "text/plain" },
      body: "private data",
    }),
    env({ RECEIPTS: { put: async () => { writes += 1; } } }),
  );
  assert.equal(response.status, 415);
  assert.equal(writes, 0);
});

test("rejects SVG uploads despite their image media type", async () => {
  const response = await worker.fetch(
    authorizedRequest("/v1/receipts", {
      method: "POST",
      headers: { "content-type": "image/svg+xml" },
      body: "<svg/>",
    }),
    env(),
  );
  assert.equal(response.status, 415);
});

test("removes the R2 object when D1 metadata persistence fails", async () => {
  const events = [];
  const response = await worker.fetch(
    authorizedRequest("/v1/receipts", {
      method: "POST",
      headers: { "content-type": "image/jpeg" },
      body: new Uint8Array([0xff, 0xd8, 0xff]),
    }),
    env({
      RECEIPTS: {
        put: async (key) => events.push(["put", key]),
        delete: async (key) => events.push(["delete", key]),
        get: async () => null,
      },
      DB: {
        prepare: () => ({
          bind: () => ({ run: async () => { throw new Error("D1 unavailable"); } }),
        }),
      },
    }),
  );

  assert.equal(response.status, 503);
  assert.equal(events.length, 2);
  assert.equal(events[0][0], "put");
  assert.deepEqual(events[1], ["delete", events[0][1]]);
});

test("downloads evidence with private and nosniff headers", async () => {
  const response = await worker.fetch(
    authorizedRequest("/v1/evidence/evidence_456"),
    env({
      RECEIPTS: {
        put: async () => {},
        delete: async () => {},
        get: async () => ({ body: "receipt-bytes" }),
      },
      DB: {
        prepare: () => ({
          bind: () => ({
            first: async () => ({ object_key: "receipts/receipt_123/evidence_456", content_type: "image/jpeg" }),
          }),
        }),
      },
    }),
  );

  assert.equal(response.status, 200);
  assert.equal(response.headers.get("cache-control"), "private, no-store");
  assert.equal(response.headers.get("x-content-type-options"), "nosniff");
  assert.equal(response.headers.get("content-disposition"), 'attachment; filename="evidence_456"');
});
