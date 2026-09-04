/* stripeClient.js — Integración mínima con Stripe SIN dependencias externas.
   ---------------------------------------------------------------------------
   Motivación: seguimos el mismo patrón que diditClient.js (llamadas HTTP
   directas + verificación de firma manual con HMAC), para no añadir el paquete
   npm `stripe` y no tocar el build de Railway.

   Expone:
     isConfigured()                         -> bool (hay STRIPE_SECRET_KEY)
     createCheckoutSession(params)          -> Promise<sessionObject>
     retrieveSession(id)                    -> Promise<sessionObject>
     verifyWebhookSignature(raw, sig, secret[, toleranceSec]) -> bool

   Las claves se leen de variables de entorno (NUNCA del código):
     STRIPE_SECRET_KEY       (sk_test_... / sk_live_...)
     STRIPE_WEBHOOK_SECRET   (whsec_...)  — para validar el webhook
   --------------------------------------------------------------------------- */
"use strict";

const https = require("https");
const crypto = require("crypto");

const API_HOST = "api.stripe.com";
const API_VERSION = "2023-10-16"; // versión fija para respuestas estables

function secretKey() {
  return process.env.STRIPE_SECRET_KEY || "";
}
function isConfigured() {
  return /^sk_(test|live)_/.test(secretKey());
}
// Modo de la clave secreta: "live" | "test" | null (sin clave válida). Sirve
// para que el admin vea de un vistazo si está cobrando de verdad o en pruebas.
function mode() {
  const sk = secretKey();
  if (/^sk_live_/.test(sk)) return "live";
  if (/^sk_test_/.test(sk)) return "test";
  return null;
}

/* --- Codificador form-urlencoded con notación de corchetes de Stripe -------
   { line_items:[{price_data:{currency:"eur"}}] }
   -> line_items[0][price_data][currency]=eur
--------------------------------------------------------------------------- */
function encodeForm(obj, prefix, out) {
  out = out || [];
  if (obj == null) return out;
  if (Array.isArray(obj)) {
    obj.forEach((v, i) => encodeForm(v, prefix ? `${prefix}[${i}]` : String(i), out));
  } else if (typeof obj === "object") {
    for (const k of Object.keys(obj)) {
      const v = obj[k];
      if (v === undefined) continue;
      encodeForm(v, prefix ? `${prefix}[${k}]` : k, out);
    }
  } else {
    out.push(`${encodeURIComponent(prefix)}=${encodeURIComponent(String(obj))}`);
  }
  return out;
}

/* --- Llamada genérica a la API de Stripe ---------------------------------- */
function apiRequest(method, apiPath, dataObj) {
  return new Promise((resolve, reject) => {
    const sk = secretKey();
    if (!sk) return reject(new Error("stripe_not_configured"));
    const body = dataObj ? encodeForm(dataObj).join("&") : "";
    const req = https.request(
      {
        host: API_HOST,
        path: apiPath,
        method,
        headers: {
          Authorization: "Bearer " + sk,
          "Content-Type": "application/x-www-form-urlencoded",
          "Content-Length": Buffer.byteLength(body),
          "Stripe-Version": API_VERSION,
        },
      },
      (res) => {
        let chunks = "";
        res.on("data", (d) => (chunks += d));
        res.on("end", () => {
          let json = null;
          try { json = JSON.parse(chunks || "{}"); } catch { json = null; }
          if (res.statusCode >= 200 && res.statusCode < 300) {
            resolve(json);
          } else {
            const msg = (json && json.error && json.error.message) || `stripe_http_${res.statusCode}`;
            const err = new Error(msg);
            err.stripe = json && json.error;
            err.status = res.statusCode;
            reject(err);
          }
        });
      }
    );
    req.on("error", reject);
    req.setTimeout(20000, () => req.destroy(new Error("stripe_timeout")));
    if (body) req.write(body);
    req.end();
  });
}

/* --- Crear una sesión de Checkout ----------------------------------------- */
async function createCheckoutSession(params) {
  return apiRequest("POST", "/v1/checkout/sessions", params);
}

/* --- Recuperar una sesión (para confirmar estado) ------------------------- */
async function retrieveSession(id) {
  return apiRequest("GET", "/v1/checkout/sessions/" + encodeURIComponent(id), null);
}

/* --- Verificación de firma del webhook (esquema oficial de Stripe) --------
   Header:  Stripe-Signature: t=1690000000,v1=hexsig[,v1=...]
   payload firmado = `${t}.${rawBody}`
   esperado = HMAC_SHA256(payloadFirmado, whsec)
--------------------------------------------------------------------------- */
function verifyWebhookSignature(rawBody, sigHeader, secret, toleranceSec = 300) {
  if (!secret || !sigHeader) return false;
  const raw = Buffer.isBuffer(rawBody) ? rawBody.toString("utf8") : String(rawBody || "");
  let t = null;
  const v1s = [];
  for (const part of String(sigHeader).split(",")) {
    const [k, val] = part.split("=");
    if (k === "t") t = val;
    else if (k === "v1") v1s.push(val);
  }
  if (!t || !v1s.length) return false;
  // Tolerancia de tiempo para evitar replays (0 = desactivada)
  if (toleranceSec > 0) {
    const ts = parseInt(t, 10);
    if (!Number.isFinite(ts)) return false;
    if (Math.abs(Math.floor(Date.now() / 1000) - ts) > toleranceSec) return false;
  }
  const signedPayload = `${t}.${raw}`;
  const expected = crypto.createHmac("sha256", secret).update(signedPayload, "utf8").digest("hex");
  const expBuf = Buffer.from(expected, "utf8");
  return v1s.some((sig) => {
    const sigBuf = Buffer.from(String(sig), "utf8");
    return sigBuf.length === expBuf.length && crypto.timingSafeEqual(sigBuf, expBuf);
  });
}

module.exports = {
  isConfigured,
  mode,
  createCheckoutSession,
  retrieveSession,
  verifyWebhookSignature,
  _encodeForm: encodeForm, // exportado para pruebas
};
