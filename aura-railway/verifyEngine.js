/* ================================================================
   verifyEngine.js — Motor de verificación de identidad (mock)
   ----------------------------------------------------------------
   Este módulo expone una API estable que el resto del backend usa
   para pedir análisis de documentos, comparación facial y prueba
   de vida. La implementación actual es un MOCK determinista pensado
   para desarrollo: devuelve scores razonables usando heurísticas
   simples sobre el tamaño de la imagen y un hash del contenido.

   Cuando se contrate un proveedor real (Onfido, Persona, iProov,
   AWS Rekognition, Azure Face API, …) sólo hay que reemplazar el
   cuerpo de estas funciones — la firma es la misma.

   Todas las funciones son async y devuelven objetos JSON.
================================================================ */
"use strict";

const crypto = require("crypto");

/* ------------------------------------------------------------
   Utilidad — decodifica una data URL "data:image/jpeg;base64,..."
   o simplemente base64 pelado. Devuelve { mime, buffer, sha256 }
------------------------------------------------------------ */
function decodeDataUrl(input) {
  if (!input || typeof input !== "string") return null;
  let mime = "application/octet-stream";
  let b64 = input;
  const m = /^data:([\w./+-]+);base64,(.+)$/i.exec(input);
  if (m) { mime = m[1]; b64 = m[2]; }
  let buffer;
  try { buffer = Buffer.from(b64, "base64"); }
  catch { return null; }
  if (!buffer || buffer.length < 32) return null;
  const sha256 = crypto.createHash("sha256").update(buffer).digest("hex");
  return { mime, buffer, sha256, byte_size: buffer.length };
}

/* ------------------------------------------------------------
   Utilidad — determina un “score” pseudo-aleatorio pero
   estable a partir de un hash + una semilla textual. Devuelve
   número entre min y max con dos decimales.
------------------------------------------------------------ */
function pseudoScore(hash, seed, min, max) {
  const h = crypto.createHash("sha1").update(hash + "|" + seed).digest();
  const v = h.readUInt32BE(0) / 0xffffffff;
  return Math.round((min + v * (max - min)) * 100) / 100;
}

/* ------------------------------------------------------------
   analyzeDocument(dataUrl, opts?)
   ----------------------------------------------------------------
   Simula el escaneo OCR / anti-fraude de un documento de identidad.
   Devuelve:
     {
       ok, score, doc_type, doc_hash,
       extracted_name, extracted_dob, extracted_age,
       reasons: [ ... ]      // motivos de duda si score bajo
     }
------------------------------------------------------------ */
async function analyzeDocument(dataUrl, opts = {}) {
  const dec = decodeDataUrl(dataUrl);
  if (!dec) {
    return {
      ok: false, score: 0, doc_hash: null,
      reasons: ["invalid_image"],
    };
  }
  // Tamaño mínimo para considerar la foto “útil”.
  if (dec.byte_size < 15 * 1024) {
    return {
      ok: false, score: 12, doc_hash: dec.sha256,
      reasons: ["image_too_small"],
    };
  }
  // Score determinista basado en el hash. En producción esto
  // vendría del motor real (calidad, holograma, MRZ, integridad).
  const score = pseudoScore(dec.sha256, "doc", 78, 97);

  // Fecha de nacimiento simulada: años atrás según el hash.
  const yrs = 18 + (parseInt(dec.sha256.slice(0, 2), 16) % 22); // 18..39
  const now = new Date();
  const dob = new Date(now.getFullYear() - yrs,
                       parseInt(dec.sha256.slice(2, 4), 16) % 12,
                       1 + (parseInt(dec.sha256.slice(4, 6), 16) % 27));

  const extracted_name = "TITULAR DEL DOCUMENTO";
  return {
    ok: score >= 70,
    score,
    doc_type: opts.doc_type || "dni",
    doc_hash: dec.sha256,
    mime: dec.mime,
    byte_size: dec.byte_size,
    extracted_name,
    extracted_dob: dob.toISOString().slice(0, 10),
    extracted_age: yrs,
    reasons: score >= 70 ? [] : ["low_quality"],
  };
}

/* ------------------------------------------------------------
   matchFaces(docDataUrl, selfieDataUrl)
   ----------------------------------------------------------------
   Devuelve { ok, score, reasons } comparando la cara del documento
   con la selfie.
------------------------------------------------------------ */
async function matchFaces(docDataUrl, selfieDataUrl) {
  const d = decodeDataUrl(docDataUrl);
  const s = decodeDataUrl(selfieDataUrl);
  if (!d || !s) {
    return { ok: false, score: 0, reasons: ["missing_image"] };
  }
  if (s.byte_size < 10 * 1024) {
    return { ok: false, score: 15, reasons: ["selfie_too_small"] };
  }
  // El score se “estabiliza” combinando ambos hashes.
  const combined = d.sha256 + s.sha256;
  const score = pseudoScore(combined, "face", 68, 96);
  return {
    ok: score >= 72,
    score,
    selfie_sha256: s.sha256,
    selfie_size: s.byte_size,
    reasons: score >= 72 ? [] : ["face_mismatch"],
  };
}

/* ------------------------------------------------------------
   detectLiveness(videoDataUrl)
   ----------------------------------------------------------------
   Videoidentificación sobre un video corto (típicamente 2-5 s).
   Devuelve { ok, score, reasons }.
------------------------------------------------------------ */
async function detectLiveness(videoDataUrl) {
  const v = decodeDataUrl(videoDataUrl);
  if (!v) return { ok: false, score: 0, reasons: ["invalid_video"] };
  if (v.byte_size < 30 * 1024) {
    return { ok: false, score: 20, reasons: ["video_too_short"] };
  }
  const score = pseudoScore(v.sha256, "live", 74, 97);
  return {
    ok: score >= 75,
    score,
    video_sha256: v.sha256,
    video_size: v.byte_size,
    reasons: score >= 75 ? [] : ["liveness_low"],
  };
}

/* ------------------------------------------------------------
   evaluate({ doc, face, live, extracted_age, minAge })
   ----------------------------------------------------------------
   Decisión global sobre el resultado de los 3 pasos. Devuelve
   uno de: "verified" | "manual_review" | "rejected"
------------------------------------------------------------ */
function evaluate({ doc, face, live, extracted_age, minAge = 18 }) {
  const reasons = [];
  if (extracted_age != null && extracted_age < minAge) {
    reasons.push("underage");
    return { decision: "rejected", reasons };
  }
  const dOk = doc && doc.score >= 70;
  const fOk = face && face.score >= 72;
  const lOk = live && live.score >= 75;
  if (dOk && fOk && lOk) return { decision: "verified", reasons: [] };
  if (!dOk) reasons.push("doc_low");
  if (!fOk) reasons.push("face_low");
  if (!lOk) reasons.push("liveness_low");
  // Si al menos dos scores rozan el umbral, permitimos revisión manual.
  const near = [doc?.score || 0, face?.score || 0, live?.score || 0]
    .filter(s => s >= 55).length;
  if (near >= 2) return { decision: "manual_review", reasons };
  return { decision: "rejected", reasons };
}

module.exports = {
  analyzeDocument,
  matchFaces,
  detectLiveness,
  evaluate,
  decodeDataUrl,
};
