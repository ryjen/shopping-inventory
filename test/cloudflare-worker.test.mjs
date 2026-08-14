import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import worker, { receiptObjectKey, validateReceiptExtractionEnvelope } from "../src/worker.mjs";

const canonicalFixture = JSON.parse(await readFile(
  new URL("../evaluation/fixtures/canonical-receipt-v1.synthetic.json", import.meta.url),
  "utf8",
));

function statement(sql, args = [], methods = {}) {
  return {
    sql,
    args,
    run: methods.run ?? (async () => ({ success: true })),
    first: methods.first ?? (async () => null),
    all: methods.all ?? (async () => ({ results: [] })),
  };
}

function statefulStructuredDb({ evidenceIds = [] } = {}) {
  const evidence = new Set(evidenceIds);
  const state = {
    envelope: null,
    imports: [],
    batches: [],
  };

  const db = {
    state,
    prepare(sql) {
      return {
        bind(...args) {
          return statement(sql, args, {
            first: async () => {
              if (sql.includes("SELECT payload_sha256 FROM receipt_extraction_envelopes")) {
                if (!state.envelope || state.envelope.envelope_id !== args[0]) return null;
                return { payload_sha256: state.envelope.payload_sha256 };
              }
              if (sql.includes("SELECT evidence_id FROM receipt_evidence")) {
                return evidence.has(args[0]) ? { evidence_id: args[0] } : null;
              }
              return null;
            },
            all: async () => {
              if (!sql.includes("SELECT import_id, line_id FROM import_raw_rows")) return { results: [] };
              return {
                results: state.imports
                  .filter((item) => item.envelope_id === args[0])
                  .sort((a, b) => a.line_number - b.line_number)
                  .map((item) => ({ import_id: item.import_id, line_id: item.line_id })),
              };
            },
          });
        },
      };
    },
    async batch(statements) {
      state.batches.push(statements);
      const envelopeInsert = statements.find((item) => item.sql.includes("INSERT INTO receipt_extraction_envelopes"));
      if (envelopeInsert) {
        state.envelope = {
          envelope_id: envelopeInsert.args[0],
          payload_sha256: envelopeInsert.args[9],
        };
      }
      for (const item of statements.filter((candidate) => candidate.sql.includes("INSERT INTO import_raw_rows"))) {
        state.imports.push({
          import_id: item.args[0],
          envelope_id: item.args[1],
          line_id: item.args[2],
          line_number: item.args[6],
        });
      }
      return statements.map(() => ({ success: true }));
    },
  };

  return db;
}

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
      prepare: (sql) => ({
        bind: (...args) => statement(sql, args),
      }),
      batch: async (statements) => statements.map(() => ({ success: true })),
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

function extractionRequest(envelope, overrides = {}) {
  return authorizedRequest("/v1/receipt-extractions", {
    method: "POST",
    headers: { "content-type": "application/json", ...(overrides.headers ?? {}) },
    body: overrides.body ?? JSON.stringify(envelope),
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

test("canonical synthetic extraction satisfies the Worker intake contract", () => {
  assert.deepEqual(validateReceiptExtractionEnvelope(canonicalFixture.envelope), []);
});

test("structured intake requires RFC3339 date-time values", () => {
  const invalid = {
    ...canonicalFixture.envelope,
    extracted_at: "January 15, 2026 18:00:00 UTC",
  };
  assert.deepEqual(validateReceiptExtractionEnvelope(invalid), ["extracted_at"]);
});

test("structured intake rejects invalid contracts before D1 writes", async () => {
  const db = statefulStructuredDb();
  const invalid = { ...canonicalFixture.envelope, record_kind: "purchase" };
  const response = await worker.fetch(extractionRequest(invalid), env({ DB: db }));

  assert.equal(response.status, 422);
  assert.deepEqual(await response.json(), { error: "invalid_contract", violations: ["record_kind"] });
  assert.equal(db.state.batches.length, 0);
});

test("structured intake caps receipt lines below the D1 Free-plan query budget", async () => {
  const db = statefulStructuredDb();
  const line = canonicalFixture.envelope.lines[0];
  const tooMany = {
    ...canonicalFixture.envelope,
    envelope_id: "env_syn_too_many",
    lines: Array.from({ length: 41 }, (_, index) => ({
      ...line,
      line_id: `line_syn_budget_${index + 1}`,
      line_number: index + 1,
    })),
  };

  const response = await worker.fetch(extractionRequest(tooMany), env({ DB: db }));
  assert.equal(response.status, 422);
  assert.deepEqual(await response.json(), { error: "invalid_contract", violations: ["lines"] });
  assert.equal(db.state.batches.length, 0);
});

test("structured intake rejects unsupported media type and malformed JSON", async () => {
  const mediaResponse = await worker.fetch(
    authorizedRequest("/v1/receipt-extractions", {
      method: "POST",
      headers: { "content-type": "text/plain" },
      body: "{}",
    }),
    env(),
  );
  assert.equal(mediaResponse.status, 415);

  const jsonResponse = await worker.fetch(
    extractionRequest(canonicalFixture.envelope, { body: "{" }),
    env(),
  );
  assert.equal(jsonResponse.status, 400);
  assert.deepEqual(await jsonResponse.json(), { error: "invalid_json" });
});

test("structured intake fails closed on oversized JSON", async () => {
  const oversized = JSON.stringify({ padding: "x".repeat(1024 * 1024) });
  const response = await worker.fetch(
    extractionRequest(canonicalFixture.envelope, { body: oversized }),
    env(),
  );
  assert.equal(response.status, 413);
});

test("structured intake atomically stages envelope, raw rows, and payload-free audit metadata", async () => {
  const db = statefulStructuredDb();
  const response = await worker.fetch(extractionRequest(canonicalFixture.envelope), env({ DB: db }));

  assert.equal(response.status, 201);
  const body = await response.json();
  assert.equal(body.envelopeId, canonicalFixture.envelope.envelope_id);
  assert.equal(body.imports.length, canonicalFixture.envelope.lines.length);
  assert.equal(body.idempotent, false);
  assert.equal(db.state.batches.length, 1);

  const sql = db.state.batches[0].map((item) => item.sql).join("\n").toLowerCase();
  assert.match(sql, /insert into receipt_extraction_envelopes/);
  assert.match(sql, /insert into import_raw_rows/);
  assert.match(sql, /insert into audit_events/);
  assert.doesNotMatch(sql, /insert into purchases/);
  assert.doesNotMatch(sql, /insert into stock/);
  assert.doesNotMatch(sql, /budget/);

  const audit = db.state.batches[0].find((item) => item.sql.includes("INSERT INTO audit_events"));
  const auditMetadata = JSON.parse(audit.args[3]);
  assert.deepEqual(Object.keys(auditMetadata).sort(), ["line_count", "schema_version", "source_type"]);
  assert.equal("merchant_raw" in auditMetadata, false);
  assert.equal("raw_text" in auditMetadata, false);
});

test("structured intake is idempotent for the same envelope payload", async () => {
  const db = statefulStructuredDb();
  const first = await worker.fetch(extractionRequest(canonicalFixture.envelope), env({ DB: db }));
  const firstBody = await first.json();
  const second = await worker.fetch(extractionRequest(canonicalFixture.envelope), env({ DB: db }));
  const secondBody = await second.json();

  assert.equal(first.status, 201);
  assert.equal(second.status, 200);
  assert.equal(secondBody.idempotent, true);
  assert.deepEqual(secondBody.imports, firstBody.imports);
  assert.equal(db.state.batches.length, 1);
});

test("structured intake rejects reuse of an envelope id for different content", async () => {
  const db = statefulStructuredDb();
  const first = await worker.fetch(extractionRequest(canonicalFixture.envelope), env({ DB: db }));
  assert.equal(first.status, 201);

  const changed = {
    ...canonicalFixture.envelope,
    merchant_raw: "Different Synthetic Market",
  };
  const second = await worker.fetch(extractionRequest(changed), env({ DB: db }));
  assert.equal(second.status, 409);
  assert.deepEqual(await second.json(), {
    error: "idempotency_conflict",
    envelopeId: canonicalFixture.envelope.envelope_id,
  });
  assert.equal(db.state.batches.length, 1);
});

test("structured intake requires referenced receipt evidence to exist", async () => {
  const db = statefulStructuredDb();
  const withEvidence = {
    ...canonicalFixture.envelope,
    source: { ...canonicalFixture.envelope.source, evidence_id: "evidence_syn_missing" },
  };
  const response = await worker.fetch(extractionRequest(withEvidence), env({ DB: db }));

  assert.equal(response.status, 422);
  assert.deepEqual(await response.json(), { error: "evidence_not_found" });
  assert.equal(db.state.batches.length, 0);
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
