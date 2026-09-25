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
    envelopes: [],
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
              if (sql.includes("SELECT payload_sha256, duplicate_state, duplicate_of_envelope_id FROM receipt_extraction_envelopes")) {
                const envelope = state.envelopes.find((item) => item.envelope_id === args[0]);
                if (!envelope) return null;
                return {
                  payload_sha256: envelope.payload_sha256,
                  duplicate_state: envelope.duplicate_state,
                  duplicate_of_envelope_id: envelope.duplicate_of_envelope_id,
                };
              }
              if (sql.includes("WHERE transaction_fingerprint = ?")) {
                const envelope = state.envelopes.find((item) =>
                  item.transaction_fingerprint === args[0] &&
                  item.envelope_id !== args[1] &&
                  (item.duplicate_state === "clear" || item.duplicate_state === "distinct")
                );
                return envelope ? { envelope_id: envelope.envelope_id } : null;
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
          transaction_fingerprint: envelopeInsert.args[10],
          duplicate_state: envelopeInsert.args[11],
          duplicate_of_envelope_id: envelopeInsert.args[12],
        };
        state.envelopes.push(state.envelope);
      }

      const rawInsert = statements.find((item) => item.sql.includes("INSERT INTO import_raw_rows"));
      const rawRows = rawInsert ? JSON.parse(rawInsert.args[5]) : [];
      for (const row of rawRows) {
        state.imports.push({
          import_id: row.import_id,
          envelope_id: rawInsert.args[0],
          line_id: row.line_id,
          line_number: row.line_number,
        });
      }

      return statements.map((item) => ({
        success: true,
        meta: { rows_written: item === rawInsert ? rawRows.length : 1 },
      }));
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

test("structured intake bulk-stages a large receipt with a fixed three-statement transaction", async () => {
  const db = statefulStructuredDb();
  const line = canonicalFixture.envelope.lines[0];
  const large = {
    ...canonicalFixture.envelope,
    envelope_id: "env_syn_large",
    lines: Array.from({ length: 120 }, (_, index) => ({
      ...line,
      line_id: `line_syn_bulk_${index + 1}`,
      line_number: index + 1,
    })),
  };

  const response = await worker.fetch(extractionRequest(large), env({ DB: db }));
  const body = await response.json();
  assert.equal(response.status, 201);
  assert.equal(body.imports.length, 120);
  assert.equal(db.state.batches.length, 1);
  assert.equal(db.state.batches[0].length, 3);

  const rawInsert = db.state.batches[0].find((item) => item.sql.includes("INSERT INTO import_raw_rows"));
  assert.ok(rawInsert);
  assert.match(rawInsert.sql, /FROM json_each\(\?\)/);
  assert.equal(JSON.parse(rawInsert.args[5]).length, 120);
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
  assert.equal(db.state.batches[0].length, 3);

  const sql = db.state.batches[0].map((item) => item.sql).join("\n").toLowerCase();
  assert.match(sql, /insert into receipt_extraction_envelopes/);
  assert.match(sql, /insert into import_raw_rows/);
  assert.match(sql, /insert into audit_events/);
  assert.doesNotMatch(sql, /insert into purchases/);
  assert.doesNotMatch(sql, /insert into stock/);
  assert.doesNotMatch(sql, /budget/);

  const audit = db.state.batches[0].find((item) => item.sql.includes("INSERT INTO audit_events"));
  const auditMetadata = JSON.parse(audit.args[4]);
  assert.deepEqual(Object.keys(auditMetadata).sort(), ["line_count", "schema_version", "source_type"]);
  assert.equal("merchant_raw" in auditMetadata, false);
  assert.equal("raw_text" in auditMetadata, false);
});

test("structured intake flags same-fingerprint distinct envelopes for duplicate review", async () => {
  const db = statefulStructuredDb();
  const first = await worker.fetch(extractionRequest(canonicalFixture.envelope), env({ DB: db }));
  assert.equal(first.status, 201);

  const secondEnvelope = {
    ...canonicalFixture.envelope,
    envelope_id: "env_syn_duplicate_review",
    source: { ...canonicalFixture.envelope.source, source_id: "src_syn_duplicate_review" },
    merchant_raw: `  ${canonicalFixture.envelope.merchant_raw.toUpperCase()}   `,
    purchased_at: canonicalFixture.envelope.purchased_at.replace(/:\d{2}(?=Z|[+-])/i, ":30"),
  };
  const second = await worker.fetch(extractionRequest(secondEnvelope), env({ DB: db }));
  const body = await second.json();

  assert.equal(second.status, 201);
  assert.equal(body.idempotent, false);
  assert.equal(body.duplicateReviewRequired, true);
  assert.equal(body.duplicateOfEnvelopeId, canonicalFixture.envelope.envelope_id);
  assert.equal(db.state.envelopes.length, 2);
  assert.equal(db.state.envelopes[1].duplicate_state, "needs_review");
  assert.equal(db.state.envelopes[1].duplicate_of_envelope_id, canonicalFixture.envelope.envelope_id);
  assert.equal(db.state.envelopes[0].transaction_fingerprint, db.state.envelopes[1].transaction_fingerprint);

  const audit = db.state.batches[1].find((item) => item.sql.includes("INSERT INTO audit_events"));
  assert.equal(audit.args[1], "receipt_extraction_duplicate_flagged");
  const metadata = JSON.parse(audit.args[4]);
  assert.equal(metadata.duplicate_review_required, true);
  assert.equal(metadata.duplicate_of_envelope_id, canonicalFixture.envelope.envelope_id);
  assert.equal("merchant_raw" in metadata, false);
});

test("structured intake does not flag a different transaction total", async () => {
  const db = statefulStructuredDb();
  const first = await worker.fetch(extractionRequest(canonicalFixture.envelope), env({ DB: db }));
  assert.equal(first.status, 201);

  const distinct = {
    ...canonicalFixture.envelope,
    envelope_id: "env_syn_distinct_total",
    source: { ...canonicalFixture.envelope.source, source_id: "src_syn_distinct_total" },
    receipt_total: canonicalFixture.envelope.receipt_total + 0.01,
  };
  const response = await worker.fetch(extractionRequest(distinct), env({ DB: db }));
  const body = await response.json();

  assert.equal(response.status, 201);
  assert.equal(body.duplicateReviewRequired, undefined);
  assert.equal(db.state.envelopes[1].duplicate_state, "clear");
  assert.notEqual(db.state.envelopes[0].transaction_fingerprint, db.state.envelopes[1].transaction_fingerprint);
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

test("exact receipt evidence duplicate returns existing opaque ids before R2 write", async () => {
  let puts = 0;
  const lookups = [];
  const audits = [];
  const db = {
    prepare(sql) {
      return {
        bind(...args) {
          if (sql.includes("FROM receipt_evidence") && sql.includes("source_sha256")) {
            lookups.push(args[0]);
            return statement(sql, args, {
              first: async () => ({ evidence_id: "evidence_existing", receipt_id: "receipt_existing" }),
            });
          }
          if (sql.includes("INSERT INTO audit_events")) {
            audits.push(args);
            return statement(sql, args);
          }
          return statement(sql, args);
        },
      };
    },
  };

  const response = await worker.fetch(
    authorizedRequest("/v1/receipts", {
      method: "POST",
      headers: { "content-type": "image/jpeg" },
      body: new Uint8Array([0xff, 0xd8, 0xff, 0x01]),
    }),
    env({
      DB: db,
      RECEIPTS: { put: async () => { puts += 1; }, get: async () => null, delete: async () => {} },
    }),
  );

  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), {
    receiptId: "receipt_existing",
    evidenceId: "evidence_existing",
    idempotent: true,
  });
  assert.equal(puts, 0);
  assert.equal(lookups.length, 1);
  assert.match(lookups[0], /^[0-9a-f]{64}$/);
  assert.equal(audits.length, 1);
  assert.deepEqual(JSON.parse(audits[0][3]), { exact_source_hash_match: true });
});

test("new receipt evidence persists its source digest", async () => {
  let evidenceInsertArgs;
  let puts = 0;
  const db = {
    prepare(sql) {
      return {
        bind(...args) {
          if (sql.includes("FROM receipt_evidence") && sql.includes("source_sha256")) {
            return statement(sql, args, { first: async () => null });
          }
          if (sql.includes("INSERT INTO receipt_evidence")) evidenceInsertArgs = args;
          return statement(sql, args);
        },
      };
    },
  };

  const response = await worker.fetch(
    authorizedRequest("/v1/receipts", {
      method: "POST",
      headers: { "content-type": "image/jpeg" },
      body: new Uint8Array([0xff, 0xd8, 0xff, 0x02]),
    }),
    env({
      DB: db,
      RECEIPTS: { put: async () => { puts += 1; }, get: async () => null, delete: async () => {} },
    }),
  );

  const body = await response.json();
  assert.equal(response.status, 201);
  assert.equal(body.idempotent, false);
  assert.equal(puts, 1);
  assert.ok(evidenceInsertArgs);
  assert.match(evidenceInsertArgs[5], /^[0-9a-f]{64}$/);
});

test("concurrent exact receipt upload cleans its R2 object and returns the winning evidence", async () => {
  let lookupCount = 0;
  const events = [];
  const db = {
    prepare(sql) {
      return {
        bind(...args) {
          if (sql.includes("FROM receipt_evidence") && sql.includes("source_sha256")) {
            lookupCount += 1;
            return statement(sql, args, {
              first: async () => lookupCount === 1
                ? null
                : { evidence_id: "evidence_race_winner", receipt_id: "receipt_race_winner" },
            });
          }
          if (sql.includes("INSERT INTO receipt_evidence")) {
            return statement(sql, args, { run: async () => { throw new Error("unique race"); } });
          }
          if (sql.includes("INSERT INTO audit_events")) return statement(sql, args);
          return statement(sql, args);
        },
      };
    },
  };

  const response = await worker.fetch(
    authorizedRequest("/v1/receipts", {
      method: "POST",
      headers: { "content-type": "image/jpeg" },
      body: new Uint8Array([0xff, 0xd8, 0xff, 0x03]),
    }),
    env({
      DB: db,
      RECEIPTS: {
        put: async (key) => events.push(["put", key]),
        delete: async (key) => events.push(["delete", key]),
        get: async () => null,
      },
    }),
  );

  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), {
    receiptId: "receipt_race_winner",
    evidenceId: "evidence_race_winner",
    idempotent: true,
  });
  assert.equal(events.length, 2);
  assert.equal(events[0][0], "put");
  assert.deepEqual(events[1], ["delete", events[0][1]]);
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
        prepare: (sql) => ({
          bind: (...args) => statement(sql, args, {
            first: async () => null,
            run: async () => {
              if (sql.includes("INSERT INTO receipt_evidence")) throw new Error("D1 unavailable");
              return { success: true };
            },
          }),
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
