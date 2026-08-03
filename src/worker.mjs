const JSON_HEADERS = { "content-type": "application/json; charset=utf-8" };
const MAX_RECEIPT_BYTES = 10 * 1024 * 1024;

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
  const contentType = request.headers.get("content-type") ?? "";
  if (!contentType.startsWith("image/") && contentType !== "application/pdf") {
    return json(415, { error: "unsupported_media_type" });
  }

  const length = Number(request.headers.get("content-length") ?? 0);
  if (length > MAX_RECEIPT_BYTES) {
    return json(413, { error: "payload_too_large" });
  }

  const receiptId = crypto.randomUUID();
  const evidenceId = crypto.randomUUID();
  const key = receiptObjectKey(receiptId, evidenceId);
  const body = await request.arrayBuffer();
  if (body.byteLength > MAX_RECEIPT_BYTES) {
    return json(413, { error: "payload_too_large" });
  }

  await env.RECEIPTS.put(key, body, {
    httpMetadata: { contentType },
    customMetadata: { schemaVersion: "1", recordKind: "receipt_evidence" },
  });

  await env.DB.prepare(
    `INSERT INTO receipt_evidence
      (evidence_id, receipt_id, object_key, content_type, byte_length, created_at)
     VALUES (?, ?, ?, ?, ?, datetime('now'))`,
  ).bind(evidenceId, receiptId, key, contentType, body.byteLength).run();

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
      "content-disposition": "attachment",
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
