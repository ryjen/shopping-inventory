const JSON_HEADERS = {
  "content-type": "application/json; charset=utf-8",
  "cache-control": "private, no-store",
};
const MAX_RECEIPT_BYTES = 10 * 1024 * 1024;
const ALLOWED_RECEIPT_TYPES = new Set([
  "application/pdf",
  "image/gif",
  "image/heic",
  "image/heif",
  "image/jpeg",
  "image/png",
  "image/webp",
]);

function json(status, body) {
  return new Response(JSON.stringify(body), { status, headers: JSON_HEADERS });
}

function authorized(request, env) {
  const expected = env.API_TOKEN;
  if (!expected) return false;
  const auth = request.headers.get("authorization") ?? "";
  return auth === `Bearer ${expected}`;
}

export function receiptObjectKey(receiptId, evidenceId) {
  const safe = /^[a-zA-Z0-9_-]+$/;
  if (!safe.test(receiptId) || !safe.test(evidenceId)) {
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
