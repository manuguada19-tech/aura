/* ================================================================
   diditClient.js — Cliente para el proveedor KYC Didit
   ----------------------------------------------------------------
   Encapsula la comunicación con la API de Didit (business.didit.me):
     - createSession(payload)        → crea una sesión de verificación
     - getSession(sessionId)         → estado + resultado
     - getDecision(sessionId)        → detalle de la decisión + medios
     - verifyWebhookSignature(body, headers) → HMAC-SHA256
   ----------------------------------------------------------------
   Credenciales exclusivamente por variables de entorno:
     DIDIT_API_KEY
     DIDIT_WORKFLOW_ID
     DIDIT_WEBHOOK_SECRET
     DIDIT_BASE_URL       (por defecto https://verification.didit.me)
================================================================ */
"use strict";

const crypto = require("crypto");

const DIDIT_API_KEY        = String(process.env.DIDIT_API_KEY || "").trim();
const DIDIT_WORKFLOW_ID    = String(process.env.DIDIT_WORKFLOW_ID || "").trim();
const DIDIT_WEBHOOK_SECRET = String(process.env.DIDIT_WEBHOOK_SECRET || "").trim();
const DIDIT_BASE_URL       = process.env.DIDIT_BASE_URL
  || "https://verification.didit.me";

function stableVendorData({ userId, email, existing } = {}) {
  const previous = String(existing || "").trim();
  if (previous) return previous.slice(0, 120);
  const uid = Number(userId);
  if (Number.isInteger(uid) && uid > 0) return `aura:user:${uid}`;
  const normalizedEmail = String(email || "").trim().toLowerCase();
  if (!normalizedEmail || !normalizedEmail.includes("@")) {
    throw new Error("didit_vendor_identity_required");
  }
  const digest = crypto.createHash("sha256").update(`citasaura|${normalizedEmail}`).digest("hex");
  return `aura:email:${digest.slice(0, 32)}`;
}

/* ---------- HTTP helper ---------- */
async function diditFetch(path, opts = {}) {
  if (!DIDIT_API_KEY) throw new Error("didit_config_missing");
  const url = DIDIT_BASE_URL.replace(/\/$/, "") + path;
  const method = opts.method || "GET";
  const headers = {
    "x-api-key": DIDIT_API_KEY,
    "Accept": "application/json",
  };
  let body;
  if (opts.body != null) {
    headers["Content-Type"] = "application/json";
    body = JSON.stringify(opts.body);
  }
  const res = await fetch(url, { method, headers, body });
  const text = await res.text();
  let data = null;
  try { data = text ? JSON.parse(text) : null; } catch { data = { raw: text }; }
  if (!res.ok) {
    const err = new Error("didit_http_" + res.status);
    err.status = res.status;
    err.body = data;
    throw err;
  }
  return data;
}

/* ---------- createSession ----------
   payload:
     - vendor_data:  string opcional (referencia interna, p.ej. verId)
     - callback:     URL a la que Didit redirige tras terminar
     - contact_details: { email }  (opcional)
------------------------------------- */
async function createSession(payload = {}) {
  if (!DIDIT_WORKFLOW_ID) throw new Error("didit_workflow_missing");
  const body = {
    workflow_id: DIDIT_WORKFLOW_ID,
    vendor_data: payload.vendor_data || undefined,
    callback: payload.callback || undefined,
    contact_details: payload.contact_details || undefined,
    metadata: payload.metadata || undefined,
  };
  const data = await diditFetch("/v3/session/", { method: "POST", body });
  return {
    session_id: data.session_id || data.id,
    session_number: data.session_number,
    url: data.url || data.session_url,
    status: data.status || "Not Started",
    workflow_id: data.workflow_id,
    raw: data,
  };
}

/* ---------- getSession ---------- */
async function getSession(sessionId) {
  if (!sessionId) throw new Error("session_id_required");
  const data = await diditFetch("/v3/session/" + encodeURIComponent(sessionId) + "/");
  return data;
}

/* ---------- getDecision ---------- */
async function getDecision(sessionId) {
  if (!sessionId) throw new Error("session_id_required");
  const data = await diditFetch(
    "/v3/session/" + encodeURIComponent(sessionId) + "/decision/"
  );
  return data;
}

/* ---------- verifyWebhookSignature ----------
   Didit v3 envía cabeceras:
     x-signature: hex HMAC-SHA256 del cuerpo bruto con el secret
     x-timestamp: epoch en segundos
   Tolerancia de 5 min para evitar replay.
--------------------------------------------- */
function verifyWebhookSignature(rawBody, headers) {
  if (!rawBody || !headers || !DIDIT_WEBHOOK_SECRET) return false;
  const sig = String(headers["x-signature"] || headers["X-Signature"] || "").trim();
  const ts  = String(headers["x-timestamp"] || headers["X-Timestamp"] || "").trim();
  if (!sig) return false;
  if (ts) {
    const now = Math.floor(Date.now() / 1000);
    const t   = parseInt(ts, 10);
    if (!isFinite(t) || Math.abs(now - t) > 300) return false; // 5 min
  }
  const expected = crypto
    .createHmac("sha256", DIDIT_WEBHOOK_SECRET)
    .update(rawBody)
    .digest("hex");
  try {
    return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(sig));
  } catch {
    return false;
  }
}

/* ---------- mapDecision ----------
   Convierte el veredicto de Didit al vocabulario interno de Aura.
------------------------------------ */
function mapDidit(status) {
  const s = String(status || "").toLowerCase();
  if (s === "approved")                           return "verified";
  if (s === "declined")                           return "rejected";
  if (s === "in review" || s === "in_review")     return "manual_review";
  if (s === "kyc data" || s === "abandoned")      return "manual_review";
  if (s === "expired" || s === "not started")     return "pending";
  return "manual_review";
}

module.exports = {
  createSession,
  getSession,
  getDecision,
  verifyWebhookSignature,
  mapDidit,
  stableVendorData,
  DIDIT_BASE_URL,
  DIDIT_WORKFLOW_ID,
};
