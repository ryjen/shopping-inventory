import assert from "node:assert/strict";
import { test } from "node:test";
import worker from "../src/worker.mjs";

const ID = "synthetic_import_1";
const ENVELOPE = "synthetic_envelope_1";
const token = "synthetic-token";
function makeDb(duplicateState = "clear") {
  const state = {
    raw: { state: "new", version: 0, lineType: "item" },
    candidate: null,
    purchase: null,
    duplicate: { state: duplicateState, version: 0 },
    events: [],
    statements: [],
  };
  const db = {
    state,
    prepare(sql) {
      return {
        bind(...args) {
          state.statements.push({ sql, args });
          return {
            async first() {
              if (sql.includes("FROM import_raw_rows raw JOIN receipt_extraction_envelopes envelope")) {
                return { state: state.raw.state, lineType: state.raw.lineType, duplicateState: state.duplicate.state };
              }
              if (sql.includes("FROM purchase_candidates candidate JOIN import_raw_rows raw")) {
                if (sql.includes("envelope.duplicate_state AS state")) {
                  return state.candidate ? { state: state.duplicate.state } : null;
                }
                return state.candidate ? { state: state.candidate.state, duplicateState: state.duplicate.state } : null;
              }
              if (sql.includes("FROM purchases WHERE source_candidate_id")) return state.purchase ?
                { id: state.purchase, supersedesId: null } : null;
              if (sql.includes("FROM receipt_extraction_envelopes WHERE envelope_id")) {
                return { ...state.duplicate };
              }
              if (sql.includes("FROM import_raw_rows WHERE import_id")) return { ...state.raw };
              if (sql.includes("FROM purchase_candidates WHERE candidate_id")) return state.candidate ?
                { ...state.candidate } : null;
              return null;
            },
            async all() {
              if (sql.includes("FROM import_raw_rows raw JOIN receipt_extraction_envelopes envelope")) {
                return { results: [{ id: ID, reviewState: state.raw.state, reviewVersion: state.raw.version,
                  duplicateState: state.duplicate.state }] };
              }
              if (sql.includes("FROM purchase_candidates candidate JOIN import_raw_rows raw")) {
                return { results: state.candidate ? [{ id: state.candidate.id,
                  reviewState: state.candidate.state, reviewVersion: state.candidate.version }] : [] };
              }
              if (sql.includes("FROM purchases purchase")) {
                return { results: state.purchase ? [{ id: state.purchase, canonicalItemId: "synthetic_oats" }] : [] };
              }
              return { results: [] };
            },
            async run() {
              if (sql.includes("INSERT INTO review_events")) {
                const [,kind,,sequence,,,fromState,toState] = args;
                const obj = kind === "import_raw_row" ? state.raw : state.candidate;
                if (!obj || obj.version + 1 !== sequence || obj.state !== fromState) throw new Error("stale");
                obj.version = sequence;
                obj.state = toState;
                state.events.push({ kind, toState });
              } else if (sql.includes("INSERT INTO duplicate_events")) {
                const [, , sequence, , , decision] = args;
                if (state.duplicate.state !== "needs_review" || state.duplicate.version + 1 !== sequence) {
                  throw new Error("duplicate state");
                }
                state.duplicate.state = decision;
                state.duplicate.version = sequence;
              } else if (sql.includes("INSERT INTO purchase_candidates")) {
                if (state.raw.state !== "approved" || state.raw.lineType !== "item" ||
                  !["clear", "distinct"].includes(state.duplicate.state)) return { success: true, meta: { changes: 0 } };
                state.candidate = { id: args[0], state: "needs_review", version: 0 };
              } else if (sql.includes("INSERT INTO purchases")) {
                if (!state.candidate || state.candidate.state !== "approved" ||
                  !["clear", "distinct"].includes(state.duplicate.state)) return { success: true, meta: { changes: 0 } };
                state.purchase = args[0];
              }
              return { success: true, meta: { changes: 1 } };
            },
          };
        },
      };
    },
  };
  return db;
}
function env(db) { return { API_TOKEN: "ingestion-only-synthetic-token", OWNER_TOKEN: token, DB: db, ENVIRONMENT: "synthetic" }; }
function request(path, input, method = "POST") {
  const opts = { method, headers: { authorization: `Bearer ${token}` } };
  if (input !== undefined) {
    opts.headers["content-type"] = "application/json";
    opts.body = JSON.stringify(input);
  }
  return new Request("https://private.example.test" + path, opts);
}
const post = async (db, path, body) => worker.fetch(request(path, body), env(db));
const get = async (db, path) => worker.fetch(request(path, undefined, "GET"), env(db));

test("review endpoints require token, including list and purchase reads", async () => {
  const db = makeDb();
  for (const path of ["/v1/review/raw", "/v1/review/candidates", "/v1/purchases"]) {
    const res = await worker.fetch(new Request("https://private.example.test" + path), env(db));
    assert.equal(res.status, 401);
    assert.equal(res.headers.get("cache-control"), "private, no-store");
  }
  const limited = await worker.fetch(new Request("https://private.example.test/v1/purchases", {
    headers: { authorization: "Bearer ingestion-only-synthetic-token" },
  }), env(db));
  assert.equal(limited.status, 403);
  const equalTokens = env(db);
  equalTokens.API_TOKEN = equalTokens.OWNER_TOKEN;
  assert.equal((await worker.fetch(request("/v1/review/raw", undefined, "GET"), equalTokens)).status, 403);
  const missingOwner = env(db);
  delete missingOwner.OWNER_TOKEN;
  assert.equal((await worker.fetch(request("/v1/review/raw", undefined, "GET"), missingOwner)).status, 401);
  assert.equal(db.state.statements.length, 0);
});

test("lists are bounded; raw/private values are no-store and not logged", async () => {
  const db = makeDb();
  const res = await get(db, "/v1/review/raw?limit=20");
  assert.equal(res.status, 200);
  assert.equal(res.headers.get("cache-control"), "private, no-store");
  assert.equal((await res.json()).items[0].id, ID);
  assert.equal((await get(db, "/v1/review/raw?limit=101")).status, 422);
  assert.equal((await get(db, "/v1/review/raw?limit=nan")).status, 422);
});

test("duplicate queues and peers are private read-only and bounded", async () => {
  const db = makeDb("needs_review");
  for (const path of ["/v1/review/duplicates?limit=10", "/v1/review/duplicates/" + ENVELOPE + "/peers"]) {
    const response = await get(db, path);
    assert.equal(response.status, 200, path);
    assert.equal(response.headers.get("cache-control"), "private, no-store");
    assert.ok(Array.isArray((await response.json()).items));
  }
  assert.ok(db.state.statements.some(x => x.sql.includes("transaction_fingerprint = (SELECT transaction_fingerprint")));
  assert.ok(db.state.statements.some(x => x.sql.includes("duplicate_state = 'needs_review'")));
});

test("human review→candidate→candidate approval→purchase with retry remains explicit", async () => {
  const db = makeDb();
  assert.equal((await post(db, "/v1/purchase-candidates", {
    sourceImportId: ID, canonicalItemId: "synthetic_oats", quantity: 1,
  })).status, 409);
  const approved = await post(db, "/v1/review/raw/" + ID, { expectedVersion: 0, decision: "approved" });
  assert.equal(approved.status, 200);
  assert.equal(db.state.raw.state, "approved");
  assert.equal((await post(db, "/v1/review/raw/" + ID, { expectedVersion: 0, decision: "rejected" })).status, 409);
  const candidate = await post(db, "/v1/purchase-candidates", {
    sourceImportId: ID, canonicalItemId: "synthetic_oats", quantity: 2, amount: 5.50,
  });
  assert.equal(candidate.status, 201);
  const { candidateId } = await candidate.json();
  assert.equal(db.state.candidate.id, candidateId);
  assert.equal((await post(db, "/v1/purchases", { candidateId })).status, 409);
  assert.equal((await post(db, "/v1/review/candidates/" + candidateId, {
    expectedVersion: 0, decision: "approved",
  })).status, 200);
  const purchase = await post(db, "/v1/purchases", { candidateId });
  assert.equal(purchase.status, 201);
  const { purchaseId } = await purchase.json();
  assert.equal(db.state.purchase, purchaseId);
  const retry = await post(db, "/v1/purchases", { candidateId });
  assert.equal(retry.status, 200);
  assert.deepEqual(await retry.json(), { purchaseId, idempotent: true });
  assert.equal((await get(db, "/v1/purchases")).status, 200);
  assert.deepEqual(db.state.events.map(x => x.toState), ["approved", "approved"]);
  assert.ok(db.state.statements.some(x => x.sql.includes("INSERT INTO purchases") &&
    x.sql.includes("candidate.review_state = 'approved'") &&
    x.sql.includes("envelope.duplicate_state IN ('clear', 'distinct')")));
});

test("duplicate decisions explicitly gate purchase/candidate creation", async () => {
  const db = makeDb("needs_review");
  assert.equal((await post(db, "/v1/review/raw/" + ID, { expectedVersion: 0, decision: "approved" })).status, 200);
  assert.equal((await post(db, "/v1/purchase-candidates", {
    sourceImportId: ID, canonicalItemId: "synthetic_oats", quantity: 1,
  })).status, 409);
  const rejectDup = await post(db, "/v1/review/duplicates/" + ENVELOPE, {
    expectedVersion: 0, decision: "confirmed_duplicate",
  });
  assert.equal(rejectDup.status, 200);
  assert.equal((await post(db, "/v1/purchase-candidates", {
    sourceImportId: ID, canonicalItemId: "synthetic_oats", quantity: 1,
  })).status, 409);
  assert.equal((await post(db, "/v1/review/duplicates/" + ENVELOPE, {
    expectedVersion: 0, decision: "distinct",
  })).status, 409);
});

test("rejects invalid decisions, source IDs, prices and methods before any writes", async () => {
  const db = makeDb();
  const invalid = [
    ["/v1/review/raw/" + ID, { expectedVersion: 0, decision: "superseded" }],
    ["/v1/review/raw/" + ID, { expectedVersion: -1, decision: "approved" }],
    ["/v1/purchase-candidates", { sourceImportId: ID, canonicalItemId: "../../secret", quantity: 1 }],
    ["/v1/purchase-candidates", { sourceImportId: ID, canonicalItemId: "milk", quantity: 0 }],
    ["/v1/purchase-candidates", { sourceImportId: ID, canonicalItemId: "milk", quantity: 1, amount: 1.234 }],
    ["/v1/purchases", { candidateId: "invalid/id" }],
    ["/v1/review/duplicates/" + ENVELOPE, { expectedVersion: 0, decision: "clear" }],
  ];
  for (const [path, body] of invalid) {
    const res = await post(db, path, body);
    assert.equal(res.status, 422, path);
  }
  assert.equal((await worker.fetch(request("/v1/purchases", {}, "PUT"), env(db))).status, 405);
  assert.equal((await post(db, "/v1/review/raw/" + ID, { expectedVersion: 0, decision: "approved" })).status, 200);
  assert.equal((await post(db, "/v1/review/raw/" + ID, { expectedVersion: 1, decision: "approved" })).status, 409);
  assert.equal(db.state.purchase, null);
});
