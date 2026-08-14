const JSON_HEADERS = {
  "content-type": "application/json; charset=utf-8",
  "cache-control": "private, no-store",
};
const MAX_RECEIPT_BYTES = 10 * 1024 * 1024;
const MAX_EXTRACTION_BYTES = 1024 * 1024;
const MAX_EXTRACTION_LINES = 500;
const SAFE_ID = /^[a-zA-Z0-9_-]{1,128}$/;
const SOURCE_TYPES = new Set(["receipt_image", "receipt_pdf", "order_email", "manual", "synthetic"]);
const LINE_TYPES = new Set(["item", "fee", "deposit", "discount", "coupon", "subtotal", "tax", "total", "informational", "return", "refund", "void"]);
const ENVELOPE_KEYS = new Set(["schema_version", "record_kind", "envelope_id", "source", "extractor", "extracted_at", "merchant_raw", "purchased_at_raw", "purchased_at", "currency", "receipt_total", "lines"]);
const SOURCE_KEYS = new Set(["source_type", "source_id", "evidence_id"]);
const LINE_KEYS = new Set(["line_id", "line_number", "line_type", "raw_text", "description_raw", "quantity", "unit", "unit_price", "extended_price", "tax_code", "parse_confidence", "notes"]);
const ALLOWED_RECEIPT_TYPES = new Set([
  "application/pdf",
  "image/gif",
  "image/heic",
  "image/heif",
  "image/jpeg",
  "image/png",
  "image/webp",
]);
const encoder = new TextEncoder();
const decoder = new TextDecoder();

function json(status, body) {
  return new Response(JSON.stringify(body), { status, headers: JSON_HEADERS });
}

function timingSafeEqualString(left, right) {
  const a = encoder.encode(left);
  const b = encoder.encode(right);
  const cloudflareTimingSafeEqual = crypto?.subtle?.timingSafeEqual;
  if (typeof cloudflareTimingSafeEqual === "function") {
    const lengthsMatch = a.byteLength === b.byteLength;
    return lengthsMatch
      ? cloudflareTimingSafeEqual.call(crypto.subtle, a, b)
      : !cloudflareTimingSafeEqual.call(crypto.subtle, a, a);
  }

  // Portable fallback for local Node tests. Workers use crypto.subtle.timingSafeEqual.
  let difference = a.byteLength ^ b.byteLength;
  const length = Math.max(a.byteLength, b.byteLength);
  for (let index = 0; index < length; index += 1) {
    difference |= (a[index] ?? 0) ^ (b[index] ?? 0);
  }
  return difference === 0;
}

function authorized(request, env) {
  const expected = env.API_TOKEN;
  if (!expected) return false;
  const auth = request.headers.get("authorization") ?? "";
  return timingSafeEqualString(auth, `Bearer ${expected}`);
}

function isPlainObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function hasOnlyKeys(value, allowed) {
  return Object.keys(value).every((key) => allowed.has(key));
}

function isNullableString(value, maxLength = 4096) {
  return value === undefined || value === null || (typeof value === "string" && value.length <= maxLength);
}

function isDateTime(value) {
  return typeof value === "string" && value.length <= 64 && value.includes("T") && Number.isFinite(Date.parse(value));
}

function isMoney(value) {
  if (value === undefined || value === null) return true;
  if (typeof value !== "number" || !Number.isFinite(value)) return false;
  return Math.abs(value * 100 - Math.round(value * 100)) < 1e-7;
}

function validateSource(source, violations) {
  if (!isPlainObject(source) || !hasOnlyKeys(source, SOURCE_KEYS)) {
    violations.add("source");
    return;
  }
  if (!SOURCE_TYPES.has(source.source_type)) violations.add("source.source_type");
  if (typeof source.source_id !== "string" || source.source_id.length < 1 || source.source_id.length > 512) {
    violations.add("source.source_id");
  }
  if (source.evidence_id !== undefined && source.evidence_id !== null && (typeof source.evidence_id !== "string" || !SAFE_ID.test(source.evidence_id))) {
    violations.add("source.evidence_id");
  }
}

function validateLine(line, index, violations) {
  const prefix = `lines[${index}]`;
  if (!isPlainObject(line) || !hasOnlyKeys(line, LINE_KEYS)) {
    violations.add(prefix);
    return;
  }
  if (typeof line.line_id !== "string" || !SAFE_ID.test(line.line_id)) violations.add(`${prefix}.line_id`);
  if (!Number.isInteger(line.line_number) || line.line_number < 1) violations.add(`${prefix}.line_number`);
  if (!LINE_TYPES.has(line.line_type)) violations.add(`${prefix}.line_type`);
  if (typeof line.raw_text !== "string" || line.raw_text.length > 8192) violations.add(`${prefix}.raw_text`);
  if (!isNullableString(line.description_raw, 2048)) violations.add(`${prefix}.description_raw`);
  if (line.quantity !== undefined && line.quantity !== null && (typeof line.quantity !== "number" || !Number.isFinite(line.quantity) || line.quantity <= 0)) {
    violations.add(`${prefix}.quantity`);
  }
  if (!isNullableString(line.unit, 64)) violations.add(`${prefix}.unit`);
  if (!isMoney(line.unit_price)) violations.add(`${prefix}.unit_price`);
  if (!isMoney(line.extended_price)) violations.add(`${prefix}.extended_price`);
  if (!isNullableString(line.tax_code, 64)) violations.add(`${prefix}.tax_code`);
  if (typeof line.parse_confidence !== "number" || !Number.isFinite(line.parse_confidence) || line.parse_confidence < 0 || line.parse_confidence > 1) {
    violations.add(`${prefix}.parse_confidence`);
  }
  if (line.notes !== undefined && (!Array.isArray(line.notes) || line.notes.length > 32 || line.notes.some((note) => typeof note !== "string" || note.length > 1024))) {
    violations.add(`${prefix}.notes`);
  }
}

export function validateReceiptExtractionEnvelope(envelope) {
  const violations = new Set();
  if (!isPlainObject(envelope) || !hasOnlyKeys(envelope, ENVELOPE_KEYS)) return ["envelope"];

  if (envelope.schema_version !== "1.0.0") violations.add("schema_version");
  if (envelope.record_kind !== "receipt_extraction_envelope") violations.add("record_kind");
  if (typeof envelope.envelope_id !== "string" || !SAFE_ID.test(envelope.envelope_id)) violations.add("envelope_id");
  validateSource(envelope.source, violations);
  if (typeof envelope.extractor !== "string" || envelope.extractor.length < 1 || envelope.extractor.length > 256) violations.add("extractor");
  if (!isDateTime(envelope.extracted_at)) violations.add("extracted_at");
  if (!isNullableString(envelope.merchant_raw, 2048)) violations.add("merchant_raw");
  if (!isNullableString(envelope.purchased_at_raw, 512)) violations.add("purchased_at_raw");
  if (envelope.purchased_at !== undefined && envelope.purchased_at !== null && !isDateTime(envelope.purchased_at)) violations.add("purchased_at");
  if (typeof envelope.currency !== "string" || !/^[A-Z]{3}$/.test(envelope.currency)) violations.add("currency");
  if (!isMoney(envelope.receipt_total)) violations.add("receipt_total");

  if (!Array.isArray(envelope.lines) || envelope.lines.length < 1 || envelope.lines.length > MAX_EXTRACTION_LINES) {
    violations.add("lines");
  } else {
    const lineIds = new Set();
    const lineNumbers = new Set();
    envelope.lines.forEach((line, index) => {
      validateLine(line, index, violations);
      if (isPlainObject(line) && typeof line.line_id === "string") {
        if (lineIds.has(line.line_id)) violations.add(`${`lines[${index}]`}.line_id_duplicate`);
        lineIds.add(line.line_id);
      }
      if (isPlainObject(line) && Number.isInteger(line.line_number)) {
        if (lineNumbers.has(line.line_number)) violations.add(`${`lines[${index}]`}.line_number_duplicate`);
        lineNumbers.add(line.line_number);
      }
    });
  }

  return [...violations].sort();
}

function canonicalize(value) {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (!isPlainObject(value)) return value;
  return Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonicalize(value[key])]));
}

async function sha256Hex(text) {
  const digest = await crypto.subtle.digest("SHA-256", encoder.encode(text));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function readBoundedText(request, maxBytes) {
  const contentLength = request.headers.get("content-length");
  if (contentLength !== null) {
    const length = Number(contentLength);
    if (!Number.isFinite(length) || length < 0) throw new TypeError("invalid_content_length");
    if (length > maxBytes) throw new RangeError("payload_too_large");
  }

  if (!request.body) return "";
  const reader = request.body.getReader();
  const chunks = [];
  let total = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > maxBytes) {
      await reader.cancel();
      throw new RangeError("payload_too_large");
    }
    chunks.push(value);
  }

  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return decoder.decode(bytes);
}

async function existingExtraction(env, envelopeId, payloadSha256) {
  const row = await env.DB.prepare(
    "SELECT payload_sha256 FROM receipt_extraction_envelopes WHERE envelope_id = ?",
  ).bind(envelopeId).first();
  if (!row) return null;
  if (row.payload_sha256 !== payloadSha256) return { conflict: true };

  const importsResult = await env.DB.prepare(
    "SELECT import_id, line_id FROM import_raw_rows WHERE envelope_id = ? ORDER BY line_number",
  ).bind(envelopeId).all();
  return {
    conflict: false,
    imports: (importsResult?.results ?? []).map((item) => ({ importId: item.import_id, lineId: item.line_id })),
  };
}

async function handleStructuredExtraction(request, env) {
  const contentType = (request.headers.get("content-type") ?? "").split(";", 1)[0].trim().toLowerCase();
  if (contentType !== "application/json") return json(415, { error: "unsupported_media_type" });

  let text;
  try {
    text = await readBoundedText(request, MAX_EXTRACTION_BYTES);
  } catch (error) {
    if (error instanceof RangeError) return json(413, { error: "payload_too_large" });
    if (error instanceof TypeError) return json(400, { error: "invalid_content_length" });
    throw error;
  }
  if (!text) return json(400, { error: "empty_payload" });

  let envelope;
  try {
    envelope = JSON.parse(text);
  } catch {
    return json(400, { error: "invalid_json" });
  }

  const violations = validateReceiptExtractionEnvelope(envelope);
  if (violations.length > 0) {
    return json(422, { error: "invalid_contract", violations: violations.slice(0, 20) });
  }

  const canonicalPayload = JSON.stringify(canonicalize(envelope));
  const payloadSha256 = await sha256Hex(canonicalPayload);
  const existing = await existingExtraction(env, envelope.envelope_id, payloadSha256);
  if (existing?.conflict) return json(409, { error: "idempotency_conflict", envelopeId: envelope.envelope_id });
  if (existing) {
    return json(200, { envelopeId: envelope.envelope_id, imports: existing.imports, idempotent: true });
  }

  if (envelope.source.evidence_id) {
    const evidence = await env.DB.prepare(
      "SELECT evidence_id FROM receipt_evidence WHERE evidence_id = ? AND deleted_at IS NULL",
    ).bind(envelope.source.evidence_id).first();
    if (!evidence) return json(422, { error: "evidence_not_found" });
  }

  const createdAt = new Date().toISOString();
  const importRows = envelope.lines.map((line) => ({
    importId: crypto.randomUUID(),
    lineId: line.line_id,
    line,
  }));
  const statements = [
    env.DB.prepare(
      `INSERT INTO receipt_extraction_envelopes
        (envelope_id, schema_version, record_kind, source_type, source_id, evidence_id, extractor, extracted_at, payload_json, payload_sha256, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).bind(
      envelope.envelope_id,
      envelope.schema_version,
      envelope.record_kind,
      envelope.source.source_type,
      envelope.source.source_id,
      envelope.source.evidence_id ?? null,
      envelope.extractor,
      envelope.extracted_at,
      canonicalPayload,
      payloadSha256,
      createdAt,
    ),
    ...importRows.map(({ importId, line }) => env.DB.prepare(
      `INSERT INTO import_raw_rows
        (import_id, envelope_id, schema_version, record_kind, line_id, source_type, source_id, evidence_id, line_number, line_type, raw_text, quantity, unit, unit_price, extended_price, parse_confidence, review_state, created_at)
       VALUES (?, ?, '1.0.0', 'import_raw_row', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'new', ?)`,
    ).bind(
      importId,
      envelope.envelope_id,
      line.line_id,
      envelope.source.source_type,
      envelope.source.source_id,
      envelope.source.evidence_id ?? null,
      line.line_number,
      line.line_type,
      line.raw_text,
      line.quantity ?? null,
      line.unit ?? null,
      line.unit_price ?? null,
      line.extended_price ?? null,
      line.parse_confidence,
      createdAt,
    )),
    env.DB.prepare(
      `INSERT INTO audit_events
        (event_id, actor_id, action, target_kind, target_id, occurred_at, metadata_json)
       VALUES (?, 'api_token', 'receipt_extraction_ingested', 'receipt_extraction_envelope', ?, ?, ?)`,
    ).bind(
      crypto.randomUUID(),
      envelope.envelope_id,
      createdAt,
      JSON.stringify({ schema_version: envelope.schema_version, line_count: envelope.lines.length, source_type: envelope.source.source_type }),
    ),
  ];

  try {
    const results = await env.DB.batch(statements);
    if (!Array.isArray(results) || results.some((result) => result?.success === false)) {
      throw new Error("D1 batch reported failure");
    }
  } catch (error) {
    // Handle a concurrent retry that won the insert race before treating the write as unavailable.
    try {
      const raced = await existingExtraction(env, envelope.envelope_id, payloadSha256);
      if (raced?.conflict) return json(409, { error: "idempotency_conflict", envelopeId: envelope.envelope_id });
      if (raced) return json(200, { envelopeId: envelope.envelope_id, imports: raced.imports, idempotent: true });
    } catch {
      // Fall through to the bounded storage error below.
    }
    console.error("failed to persist structured receipt extraction", { envelopeId: envelope.envelope_id, error });
    return json(503, { error: "storage_unavailable" });
  }

  return json(201, {
    envelopeId: envelope.envelope_id,
    imports: importRows.map(({ importId, lineId }) => ({ importId, lineId })),
    idempotent: false,
  });
}

export function receiptObjectKey(receiptId, evidenceId) {
  if (!SAFE_ID.test(receiptId) || !SAFE_ID.test(evidenceId)) {
    throw new TypeError("receipt and evidence identifiers must be opaque safe identifiers");
  }
  return `receipts/${receiptId}/${evidenceId}`;
}

async function handleReceiptUpload(request, env) {
  const contentType = (request.headers.get("content-type") ?? "")
    .split(";", 1)[0]
    .trim()
    .toLowerCase();
  if (!ALLOWED_RECEIPT_TYPES.has(contentType)) {
    return json(415, { error: "unsupported_media_type" });
  }

  const contentLength = request.headers.get("content-length");
  if (contentLength !== null) {
    const length = Number(contentLength);
    if (!Number.isFinite(length) || length < 0) {
      return json(400, { error: "invalid_content_length" });
    }
    if (length > MAX_RECEIPT_BYTES) {
      return json(413, { error: "payload_too_large" });
    }
  }

  const body = await request.arrayBuffer();
  if (body.byteLength === 0) {
    return json(400, { error: "empty_payload" });
  }
  if (body.byteLength > MAX_RECEIPT_BYTES) {
    return json(413, { error: "payload_too_large" });
  }

  const receiptId = crypto.randomUUID();
  const evidenceId = crypto.randomUUID();
  const key = receiptObjectKey(receiptId, evidenceId);

  await env.RECEIPTS.put(key, body, {
    httpMetadata: { contentType },
    customMetadata: { schemaVersion: "1", recordKind: "receipt_evidence" },
  });

  try {
    const result = await env.DB.prepare(
      `INSERT INTO receipt_evidence
        (evidence_id, receipt_id, object_key, content_type, byte_length, created_at)
       VALUES (?, ?, ?, ?, ?, datetime('now'))`,
    ).bind(evidenceId, receiptId, key, contentType, body.byteLength).run();
    if (result?.success === false) {
      throw new Error("D1 insert reported failure");
    }
  } catch (error) {
    try {
      await env.RECEIPTS.delete(key);
    } catch {
      console.error("failed to remove orphaned receipt evidence", { evidenceId });
    }
    console.error("failed to persist receipt evidence metadata", { evidenceId, error });
    return json(503, { error: "storage_unavailable" });
  }

  return json(201, { receiptId, evidenceId });
}

async function handleEvidenceDownload(request, env, evidenceId) {
  const row = await env.DB.prepare(
    "SELECT object_key, content_type FROM receipt_evidence WHERE evidence_id = ? AND deleted_at IS NULL",
  ).bind(evidenceId).first();
  if (!row) return json(404, { error: "not_found" });

  const object = await env.RECEIPTS.get(row.object_key);
  if (!object) return json(404, { error: "not_found" });

  return new Response(object.body, {
    headers: {
      "content-type": row.content_type,
      "cache-control": "private, no-store",
      "content-disposition": `attachment; filename="${evidenceId}"`,
      "x-content-type-options": "nosniff",
    },
  });
}

export default {
  async fetch(request, env) {
    if (!authorized(request, env)) return json(401, { error: "unauthorized" });

    const url = new URL(request.url);
    if (request.method === "POST" && url.pathname === "/v1/receipts") {
      return handleReceiptUpload(request, env);
    }

    if (request.method === "POST" && url.pathname === "/v1/receipt-extractions") {
      return handleStructuredExtraction(request, env);
    }

    const evidenceMatch = url.pathname.match(/^\/v1\/evidence\/([a-zA-Z0-9_-]+)$/);
    if (request.method === "GET" && evidenceMatch) {
      return handleEvidenceDownload(request, env, evidenceMatch[1]);
    }

    if (request.method === "GET" && url.pathname === "/health") {
      return json(200, { status: "ok", environment: env.ENVIRONMENT ?? "unknown" });
    }

    return json(404, { error: "not_found" });
  },
};
