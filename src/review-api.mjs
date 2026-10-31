// Private, authenticated owner review surface. The Worker performs authentication
// before dispatching here; no integration or model can exercise these routes.
const JSON_HEADERS = { "content-type": "application/json; charset=utf-8", "cache-control": "private, no-store" };
const MAX_DECISION_BYTES = 4096;
const MAX_PAGE_SIZE = 100;
const DEFAULT_PAGE_SIZE = 30;
const ID = /^[A-Za-z0-9_-]{1,128}$/;
const ITEM_ID = /^[A-Za-z0-9_.:-]{1,128}$/;
const ACTOR_KIND = "user";
const ACTOR_ID = "owner_api_token";
const SOURCE_STATE = Object.freeze({ RAW: "import_raw_row", CANDIDATE: "purchase_candidate" });
const DECISIONS = new Set(["approved", "rejected"]);
const DUPLICATE_DECISIONS = new Set(["distinct", "confirmed_duplicate"]);

function json(status, body) {
  return new Response(JSON.stringify(body), { status, headers: JSON_HEADERS });
}
function fieldsOnly(value, keys) {
  return value !== null && typeof value === "object" && !Array.isArray(value) &&
    Object.keys(value).every((key) => keys.includes(key));
}
function safeId(value) { return typeof value === "string" && ID.test(value); }
function cents(value) {
  return value === null || (typeof value === "number" && Number.isFinite(value) &&
    Math.abs(value * 100 - Math.round(value * 100)) < 1e-7);
}
function pageSize(url) {
  const value = url.searchParams.get("limit");
  if (value === null) return DEFAULT_PAGE_SIZE;
  const number = Number(value);
  return Number.isInteger(number) && number >= 1 && number <= MAX_PAGE_SIZE ? number : null;
}
async function readJson(request) {
  if ((request.headers.get("content-type") || "").split(";")[0].trim().toLowerCase() !== "application/json") {
    return { error: json(415, { error: "unsupported_media_type" }) };
  }
  const declared = request.headers.get("content-length");
  if (declared !== null && (!/^\d+$/.test(declared) || Number(declared) > MAX_DECISION_BYTES)) {
    return { error: json(413, { error: "payload_too_large" }) };
  }
  if (!request.body) return { error: json(400, { error: "empty_payload" }) };
  const reader = request.body.getReader();
  const fragments = [];
  let total = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > MAX_DECISION_BYTES) {
        await reader.cancel();
        return { error: json(413, { error: "payload_too_large" }) };
      }
      fragments.push(value);
    }
  } catch {
    return { error: json(400, { error: "invalid_body" }) };
  }
  if (total === 0) return { error: json(400, { error: "empty_payload" }) };
  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const fragment of fragments) { bytes.set(fragment, offset); offset += fragment.byteLength; }
  try { return { value: JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes)) }; }
  catch { return { error: json(400, { error: "invalid_json" }) }; }
}

async function listQueue(env, kind, limit) {
  const raw = kind === SOURCE_STATE.RAW;
  const query = raw
    ? `SELECT raw.import_id AS id, raw.envelope_id AS envelopeId, raw.line_number AS lineNumber,
       raw.line_type AS lineType, raw.raw_text AS rawText, raw.quantity, raw.unit,
       raw.extended_price AS amount, raw.review_state AS reviewState,
       raw.review_version AS reviewVersion, envelope.duplicate_state AS duplicateState
       FROM import_raw_rows raw JOIN receipt_extraction_envelopes envelope
         ON envelope.envelope_id = raw.envelope_id
       WHERE raw.review_state IN ('new', 'needs_review')
       ORDER BY raw.created_at ASC, raw.import_id ASC LIMIT ?`
    : `SELECT candidate.candidate_id AS id, candidate.source_import_id AS sourceImportId,
       candidate.canonical_item_id AS canonicalItemId, candidate.quantity, candidate.unit,
       candidate.amount, candidate.review_state AS reviewState,
       candidate.review_version AS reviewVersion, envelope.duplicate_state AS duplicateState
       FROM purchase_candidates candidate JOIN import_raw_rows raw
         ON raw.import_id = candidate.source_import_id
       JOIN receipt_extraction_envelopes envelope ON envelope.envelope_id = raw.envelope_id
       WHERE candidate.review_state = 'needs_review'
       ORDER BY candidate.created_at ASC, candidate.candidate_id ASC LIMIT ?`;
  const result = await env.DB.prepare(query).bind(limit).all();
  return json(200, { items: result.results ?? [], limit });
}

async function listDuplicates(env, limit) {
  const result = await env.DB.prepare(
    `SELECT envelope_id AS id, source_type AS sourceType,
     json_extract(payload_json, '$.merchant_raw') AS merchant,
     json_extract(payload_json, '$.purchased_at') AS purchasedAt,
     json_extract(payload_json, '$.receipt_total') AS receiptTotal,
     duplicate_state AS duplicateState, duplicate_version AS duplicateVersion
     FROM receipt_extraction_envelopes WHERE duplicate_state = 'needs_review'
     ORDER BY created_at ASC, envelope_id ASC LIMIT ?`,
  ).bind(limit).all();
  return json(200, { items: result.results ?? [], limit });
}

async function listDuplicatePeers(env, envelopeId) {
  const result = await env.DB.prepare(
    `SELECT envelope_id AS id, source_type AS sourceType,
     json_extract(payload_json, '$.merchant_raw') AS merchant,
     json_extract(payload_json, '$.purchased_at') AS purchasedAt,
     json_extract(payload_json, '$.receipt_total') AS receiptTotal,
     duplicate_state AS duplicateState
     FROM receipt_extraction_envelopes
     WHERE transaction_fingerprint IS NOT NULL
       AND transaction_fingerprint = (SELECT transaction_fingerprint
          FROM receipt_extraction_envelopes WHERE envelope_id = ?)
     ORDER BY created_at ASC, envelope_id ASC LIMIT ?`,
  ).bind(envelopeId, MAX_PAGE_SIZE).all();
  return json(200, { items: result.results ?? [] });
}

async function listPurchases(env, limit) {
  const result = await env.DB.prepare(
    `SELECT purchase.purchase_id AS id, purchase.canonical_item_id AS canonicalItemId,
     purchase.quantity, purchase.unit, purchase.amount, purchase.acquired_at AS acquiredAt,
     purchase.supersedes_id AS supersedesId, purchase.created_at AS createdAt
     FROM purchases purchase
     WHERE NOT EXISTS (SELECT 1 FROM purchases newer WHERE newer.supersedes_id = purchase.purchase_id)
     ORDER BY purchase.created_at DESC, purchase.purchase_id DESC LIMIT ?`,
  ).bind(limit).all();
  return json(200, { items: result.results ?? [], limit });
}

async function reviewDecision(env, kind, targetId, input) {
  if (!safeId(targetId) || !fieldsOnly(input, ["expectedVersion", "decision"]) ||
    !Number.isInteger(input.expectedVersion) || input.expectedVersion < 0 ||
    !DECISIONS.has(input.decision)) return json(422, { error: "invalid_decision" });
  const raw = kind === SOURCE_STATE.RAW;
  const table = raw ? "import_raw_rows" : "purchase_candidates";
  const column = raw ? "import_id" : "candidate_id";
  const row = await env.DB.prepare(
    `SELECT review_state AS state, review_version AS version FROM ${table} WHERE ${column} = ?`,
  ).bind(targetId).first();
  if (!row) return json(404, { error: "not_found" });
  if (row.version !== input.expectedVersion || !["new", "needs_review"].includes(row.state) ||
    (!raw && row.state !== "needs_review")) return json(409, { error: "stale_review" });
  if (!raw && input.decision === "approved") {
    const duplicate = await env.DB.prepare(
      `SELECT envelope.duplicate_state AS state
       FROM purchase_candidates candidate JOIN import_raw_rows raw
         ON raw.import_id = candidate.source_import_id
       JOIN receipt_extraction_envelopes envelope ON envelope.envelope_id = raw.envelope_id
       WHERE candidate.candidate_id = ?`,
    ).bind(targetId).first();
    if (!duplicate || !["clear", "distinct"].includes(duplicate.state)) {
      return json(409, { error: "duplicate_review_required" });
    }
  }
  const sequence = row.version + 1;
  try {
    const result = await env.DB.prepare(
      `INSERT INTO review_events
       (event_id, target_kind, target_id, sequence, actor_kind, actor_id,
        from_state, to_state, reason_code, occurred_at, metadata_json)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, '{}')`,
    ).bind(crypto.randomUUID(), kind, targetId, sequence, ACTOR_KIND, ACTOR_ID,
      row.state, input.decision, "owner_review", new Date().toISOString()).run();
    if (result.success === false) throw new Error("review write failed");
    return json(200, { id: targetId, reviewState: input.decision, reviewVersion: sequence });
  } catch {
    const current = await env.DB.prepare(`SELECT review_version AS version FROM ${table} WHERE ${column} = ?`)
      .bind(targetId).first().catch(() => null);
    return json(current?.version !== undefined && current.version !== row.version ? 409 : 503,
      { error: current?.version !== undefined && current.version !== row.version ? "stale_review" : "review_unavailable" });
  }
}

async function duplicateDecision(env, envelopeId, input) {
  if (!safeId(envelopeId) || !fieldsOnly(input, ["expectedVersion", "decision"]) ||
    !Number.isInteger(input.expectedVersion) || input.expectedVersion < 0 ||
    !DUPLICATE_DECISIONS.has(input.decision)) return json(422, { error: "invalid_decision" });
  const row = await env.DB.prepare(
    "SELECT duplicate_state AS state, duplicate_version AS version FROM receipt_extraction_envelopes WHERE envelope_id = ?",
  ).bind(envelopeId).first();
  if (!row) return json(404, { error: "not_found" });
  if (row.version !== input.expectedVersion || row.state !== "needs_review") {
    return json(409, { error: "stale_review" });
  }
  try {
    const result = await env.DB.prepare(
      `INSERT INTO duplicate_events
       (event_id, envelope_id, sequence, actor_kind, actor_id, from_state, to_state,
        reason_code, occurred_at, metadata_json)
       VALUES (?, ?, ?, ?, ?, 'needs_review', ?, 'owner_duplicate_review', ?, '{}')`,
    ).bind(crypto.randomUUID(), envelopeId, row.version + 1, ACTOR_KIND, ACTOR_ID,
      input.decision, new Date().toISOString()).run();
    if (result.success === false) throw new Error("duplicate write failed");
    return json(200, { envelopeId, duplicateState: input.decision, duplicateVersion: row.version + 1 });
  } catch {
    const current = await env.DB.prepare(
      "SELECT duplicate_version AS version FROM receipt_extraction_envelopes WHERE envelope_id = ?",
    ).bind(envelopeId).first().catch(() => null);
    if (current && current.version !== row.version) return json(409, { error: "stale_review" });
    return json(503, { error: "review_unavailable" });
  }
}

async function createCandidate(env, input) {
  if (!fieldsOnly(input, ["sourceImportId", "canonicalItemId", "quantity", "unit", "amount"]) ||
      !safeId(input.sourceImportId) || typeof input.canonicalItemId !== "string" ||
      !ITEM_ID.test(input.canonicalItemId) || typeof input.quantity !== "number" ||
      !Number.isFinite(input.quantity) || input.quantity <= 0 ||
      (input.unit !== undefined && input.unit !== null && (typeof input.unit !== "string" || input.unit.length > 64)) ||
      (input.amount !== undefined && !cents(input.amount))) {
    return json(422, { error: "invalid_candidate" });
  }
  const raw = await env.DB.prepare(
    `SELECT raw.review_state AS state, raw.line_type AS lineType, envelope.duplicate_state AS duplicateState
     FROM import_raw_rows raw JOIN receipt_extraction_envelopes envelope
       ON envelope.envelope_id = raw.envelope_id WHERE raw.import_id = ?`,
  ).bind(input.sourceImportId).first();
  if (!raw) return json(404, { error: "not_found" });
  if (raw.state !== "approved" || raw.lineType !== "item" ||
      !["clear", "distinct"].includes(raw.duplicateState)) return json(409, { error: "not_eligible" });
  const candidateId = crypto.randomUUID();
  const result = await env.DB.prepare(
    `INSERT INTO purchase_candidates (candidate_id, source_import_id, canonical_item_id,
      quantity, unit, amount, normalization_confidence, review_state, created_at)
     SELECT ?, raw.import_id, ?, ?, ?, ?, NULL, 'needs_review', ?
     FROM import_raw_rows raw JOIN receipt_extraction_envelopes envelope
       ON envelope.envelope_id = raw.envelope_id
     WHERE raw.import_id = ? AND raw.review_state = 'approved' AND raw.line_type = 'item'
       AND envelope.duplicate_state IN ('clear', 'distinct')`,
  ).bind(candidateId, input.canonicalItemId, input.quantity, input.unit ?? null,
    input.amount ?? null, new Date().toISOString(), input.sourceImportId).run();
  if (result.success === false) throw new Error("candidate write failed");
  if (result.meta?.changes !== 1) return json(409, { error: "not_eligible" });
  return json(201, { candidateId, reviewState: "needs_review" });
}

async function createPurchase(env, input) {
  if (!fieldsOnly(input, ["candidateId", "supersedesId"]) || !safeId(input.candidateId) ||
    (input.supersedesId !== undefined && input.supersedesId !== null && !safeId(input.supersedesId))) {
    return json(422, { error: "invalid_purchase" });
  }
  const old = await env.DB.prepare(
    "SELECT purchase_id AS id, supersedes_id AS supersedesId FROM purchases WHERE source_candidate_id = ?",
  ).bind(input.candidateId).first();
  if (old) {
    if ((old.supersedesId ?? null) !== (input.supersedesId ?? null)) {
      return json(409, { error: "candidate_already_promoted" });
    }
    return json(200, { purchaseId: old.id, idempotent: true });
  }
  const candidate = await env.DB.prepare(
    `SELECT candidate.review_state AS state, envelope.duplicate_state AS duplicateState
     FROM purchase_candidates candidate JOIN import_raw_rows raw
       ON raw.import_id = candidate.source_import_id
     JOIN receipt_extraction_envelopes envelope ON envelope.envelope_id = raw.envelope_id
     WHERE candidate.candidate_id = ?`,
  ).bind(input.candidateId).first();
  if (!candidate) return json(404, { error: "not_found" });
  if (candidate.state !== "approved" || !["clear", "distinct"].includes(candidate.duplicateState)) {
    return json(409, { error: "not_eligible" });
  }
  const purchaseId = crypto.randomUUID();
  try {
    const result = await env.DB.prepare(
      `INSERT INTO purchases
       (purchase_id, source_candidate_id, canonical_item_id, quantity, unit,
        amount, acquired_at, supersedes_id, created_at, actor_id, actor_kind, correlation_id)
       SELECT ?, candidate.candidate_id, candidate.canonical_item_id, candidate.quantity,
         candidate.unit, candidate.amount, json_extract(envelope.payload_json, '$.purchased_at'),
         ?, ?, ?, 'user', ?
       FROM purchase_candidates candidate
       JOIN import_raw_rows raw ON raw.import_id = candidate.source_import_id
       JOIN receipt_extraction_envelopes envelope ON envelope.envelope_id = raw.envelope_id
       WHERE candidate.candidate_id = ? AND candidate.review_state = 'approved'
         AND envelope.duplicate_state IN ('clear', 'distinct')`,
    ).bind(purchaseId, input.supersedesId ?? null, new Date().toISOString(), ACTOR_ID,
      crypto.randomUUID(), input.candidateId).run();
    if (result.success === false) throw new Error("purchase write failed");
    if (result.meta?.changes !== 1) return json(409, { error: "not_eligible" });
    return json(201, { purchaseId, idempotent: false });
  } catch (error) {
    let raced;
    try {
      raced = await env.DB.prepare(
        "SELECT purchase_id AS id, supersedes_id AS supersedesId FROM purchases WHERE source_candidate_id = ?",
      ).bind(input.candidateId).first();
    } catch {
      return json(503, { error: "storage_unavailable" });
    }
    if (raced && (raced.supersedesId ?? null) === (input.supersedesId ?? null)) {
      return json(200, { purchaseId: raced.id, idempotent: true });
    }
    const conflict = raced || /constraint|duplicate|supersed|foreign key/i.test(String(error?.message ?? ""));
    return json(conflict ? 409 : 503, {
      error: conflict ? "purchase_conflict" : "storage_unavailable",
    });
  }
}

export async function handleReviewApi(request, env) {
  const url = new URL(request.url);
  const path = url.pathname;
  const queueKind = path === "/v1/review/raw" ? SOURCE_STATE.RAW :
    path === "/v1/review/candidates" ? SOURCE_STATE.CANDIDATE : null;
  const duplicatesQueue = path === "/v1/review/duplicates";
  const peers = path.match(/^\/v1\/review\/duplicates\/([A-Za-z0-9_-]{1,128})\/peers$/);
  const event = path.match(/^\/v1\/review\/(raw|candidates|duplicates)\/([A-Za-z0-9_-]{1,128})$/);
  const isPurchases = path === "/v1/purchases";
  const isCandidates = path === "/v1/purchase-candidates";
  if (!queueKind && !duplicatesQueue && !peers && !event && !isPurchases && !isCandidates) return null;
  try {
    if (request.method === "GET") {
      const limit = pageSize(url);
      if (limit === null) return json(422, { error: "invalid_limit" });
      if (queueKind) return await listQueue(env, queueKind, limit);
      if (duplicatesQueue) return await listDuplicates(env, limit);
      if (peers) return await listDuplicatePeers(env, peers[1]);
      if (isPurchases) return await listPurchases(env, limit);
      return json(405, { error: "method_not_allowed" });
    }
    if (request.method !== "POST" || (!event && !isPurchases && !isCandidates)) {
      return json(405, { error: "method_not_allowed" });
    }
    const body = await readJson(request);
    if (body.error) return body.error;
    if (event) {
      const [, targetKind, id] = event;
      if (targetKind === "duplicates") return await duplicateDecision(env, id, body.value);
      return await reviewDecision(env, targetKind === "raw" ? SOURCE_STATE.RAW : SOURCE_STATE.CANDIDATE, id, body.value);
    }
    if (isCandidates) return await createCandidate(env, body.value);
    return await createPurchase(env, body.value);
  } catch {
    return json(503, { error: "storage_unavailable" });
  }
}
