/* =====================================================================
   AURA — V714 · Inicio de sesión con huella digital / Face ID (WebAuthn)
   ---------------------------------------------------------------------
   Añade autenticación biométrica (huella, Face ID, Windows Hello, llaves
   de seguridad) SIN dependencias externas: usa solo el módulo nativo
   `crypto` de Node. Es 100% aditivo y retrocompatible:
     · No toca ninguna ruta existente.
     · El login clásico por email sigue funcionando igual.
     · El registro de la credencial es opt-in desde Ajustes → Seguridad.

   Flujo:
     Registro (usuario ya logueado, self-auth por readMyUserId):
       POST /api/my/webauthn/register/options  -> { challenge, rp, user, ... }
       POST /api/my/webauthn/register/verify    { credential }  -> { ok }
       GET  /api/my/webauthn/credentials         -> { items }
       DELETE /api/my/webauthn/credentials/:id   -> { ok }
     Login (público, pre-sesión):
       POST /api/webauthn/login/options  { email } -> { challenge, allow }
       POST /api/webauthn/login/verify   { email, credential } -> { ok, user, auth_token }

   Verificación de firma con crypto nativo (ES256/RS256/EdDSA). La
   attestation se acepta como "none" (solo extraemos la clave pública del
   authenticatorData); es el modelo recomendado para 2FA/login sin backend
   de attestation. rpId se deriva del host de la petición para funcionar
   en cualquier dominio (citasaura.es y previews de Railway).
   ===================================================================== */
"use strict";

const crypto = require("crypto");

/* ---------- utilidades base64url ---------- */
const b64url = (buf) => Buffer.from(buf).toString("base64url");
const fromB64url = (str) => Buffer.from(String(str || ""), "base64url");

/* ---------- decodificador CBOR mínimo (subconjunto WebAuthn) ----------
   Soporta: uint, negativo, byte string, text string, array y map. Es lo
   único que aparece en attestationObject y en las claves COSE.        */
function cborDecode(buf, start = 0) {
  let off = start;
  function readLen(ai) {
    if (ai < 24) return ai;
    if (ai === 24) { const v = buf.readUInt8(off); off += 1; return v; }
    if (ai === 25) { const v = buf.readUInt16BE(off); off += 2; return v; }
    if (ai === 26) { const v = buf.readUInt32BE(off); off += 4; return v; }
    if (ai === 27) { const v = Number(buf.readBigUInt64BE(off)); off += 8; return v; }
    throw new Error("cbor_len_unsupported");
  }
  function parse() {
    const b = buf.readUInt8(off); off += 1;
    const type = b >> 5;
    const ai = b & 0x1f;
    switch (type) {
      case 0: return readLen(ai);                    // uint
      case 1: return -1 - readLen(ai);               // negativo
      case 2: { const n = readLen(ai); const s = buf.subarray(off, off + n); off += n; return s; }   // bytes
      case 3: { const n = readLen(ai); const s = buf.subarray(off, off + n).toString("utf8"); off += n; return s; } // texto
      case 4: { const n = readLen(ai); const a = []; for (let i = 0; i < n; i++) a.push(parse()); return a; }        // array
      case 5: { const n = readLen(ai); const m = new Map(); for (let i = 0; i < n; i++) { const k = parse(); m.set(k, parse()); } return m; } // map
      case 7: { if (ai === 20) return false; if (ai === 21) return true; if (ai === 22) return null; return null; } // simple
      default: throw new Error("cbor_type_unsupported:" + type);
    }
  }
  const value = parse();
  return { value, offset: off };
}

/* ---------- authenticatorData -> { rpIdHash, flags, signCount, credId, cosePub } ---------- */
function parseAuthData(buf) {
  const rpIdHash = buf.subarray(0, 32);
  const flags = buf.readUInt8(32);
  const signCount = buf.readUInt32BE(33);
  const out = { rpIdHash, flags, signCount, credId: null, cosePub: null };
  let off = 37;
  const AT = 0x40; // attested credential data present
  if (flags & AT) {
    // aaguid(16) + credIdLen(2) + credId(L) + COSE key (resto)
    off += 16;
    const credLen = buf.readUInt16BE(off); off += 2;
    out.credId = buf.subarray(off, off + credLen); off += credLen;
    const { value } = cborDecode(buf, off);
    out.cosePub = value; // Map
  }
  return out;
}

/* ---------- COSE key (Map) -> { jwk, kty, alg-digest } ---------- */
function coseToJwk(cose) {
  const kty = cose.get(1);
  if (kty === 2) { // EC2
    const crv = cose.get(-1);
    const x = cose.get(-2), y = cose.get(-3);
    const crvName = crv === 1 ? "P-256" : crv === 2 ? "P-384" : crv === 3 ? "P-521" : null;
    if (!crvName) throw new Error("ec_crv_unsupported");
    return { jwk: { kty: "EC", crv: crvName, x: b64url(x), y: b64url(y) }, kty: "EC", digest: "sha256" };
  }
  if (kty === 3) { // RSA
    const n = cose.get(-1), e = cose.get(-2);
    return { jwk: { kty: "RSA", n: b64url(n), e: b64url(e) }, kty: "RSA", digest: "sha256" };
  }
  if (kty === 1) { // OKP (Ed25519)
    const x = cose.get(-2);
    return { jwk: { kty: "OKP", crv: "Ed25519", x: b64url(x) }, kty: "OKP", digest: null };
  }
  throw new Error("cose_kty_unsupported");
}

/* ---------- verificación de firma (login) ---------- */
function verifySignature(jwkRow, authDataBuf, clientDataJSONBuf, sigBuf) {
  const jwk = typeof jwkRow.public_key === "string" ? JSON.parse(jwkRow.public_key) : jwkRow.public_key;
  const keyObj = crypto.createPublicKey({ key: jwk, format: "jwk" });
  const clientHash = crypto.createHash("sha256").update(clientDataJSONBuf).digest();
  const signedData = Buffer.concat([authDataBuf, clientHash]);
  if (jwk.kty === "OKP") return crypto.verify(null, signedData, keyObj, sigBuf); // EdDSA
  return crypto.verify("sha256", signedData, keyObj, sigBuf); // EC (DER) / RSA PKCS1
}

/* ---------- retos en memoria (TTL 5 min) ---------- */
const CHALLENGES = new Map();
const CH_TTL = 5 * 60 * 1000;
function putChallenge(key, challenge) {
  CHALLENGES.set(key, { challenge, exp: Date.now() + CH_TTL });
}
function takeChallenge(key) {
  const e = CHALLENGES.get(key);
  CHALLENGES.delete(key);
  if (!e || e.exp < Date.now()) return null;
  return e.challenge;
}
setInterval(() => {
  const now = Date.now();
  for (const [k, v] of CHALLENGES) if (v.exp < now) CHALLENGES.delete(k);
}, 60 * 1000).unref?.();

/* ---------- rpId / origin desde la petición ---------- */
function rpIdFor(req) {
  // Express req.hostname = host sin puerto. WebAuthn exige rpId == dominio.
  return req.hostname || (req.get("host") || "").split(":")[0] || "localhost";
}
function verifyClientData(clientDataJSON, expectedType, expectedChallenge, rpId) {
  let cd;
  try { cd = JSON.parse(clientDataJSON.toString("utf8")); } catch { return "bad_clientdata"; }
  if (cd.type !== expectedType) return "bad_type";
  if (cd.challenge !== b64url(expectedChallenge)) return "bad_challenge";
  let host;
  try { host = new URL(cd.origin).hostname; } catch { return "bad_origin"; }
  if (host !== rpId) return "origin_mismatch";
  return null;
}

async function migrate(pool) {
  await pool.query(`CREATE TABLE IF NOT EXISTS webauthn_credentials (
    id INT AUTO_INCREMENT PRIMARY KEY,
    user_id INT NOT NULL,
    credential_id VARCHAR(512) NOT NULL,
    public_key TEXT NOT NULL,
    kty VARCHAR(10) NOT NULL DEFAULT 'EC',
    sign_count INT UNSIGNED NOT NULL DEFAULT 0,
    label VARCHAR(120) NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    last_used_at TIMESTAMP NULL,
    UNIQUE KEY uniq_cred (credential_id),
    INDEX idx_user (user_id)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`);
}

function register(app, pool, helpers) {
  const { wrap, readMyUserId } = helpers;

  // === REGISTRO (usuario autenticado) ==============================
  app.post("/api/my/webauthn/register/options", wrap(async (req, res) => {
    const uid = readMyUserId(req);
    if (!uid) return res.status(401).json({ error: "no_user" });
    const [uRows] = await pool.query("SELECT id, email, name FROM users WHERE id=? LIMIT 1", [uid]);
    if (!uRows.length) return res.status(404).json({ error: "user_not_found" });
    const u = uRows[0];
    const challenge = crypto.randomBytes(32);
    putChallenge(`reg:${uid}`, challenge);
    const [creds] = await pool.query("SELECT credential_id FROM webauthn_credentials WHERE user_id=?", [uid]);
    res.json({
      ok: true,
      challenge: b64url(challenge),
      rp: { id: rpIdFor(req), name: "Aura" },
      user: { id: b64url(Buffer.from(String(uid))), name: u.email, displayName: u.name || u.email },
      pubKeyCredParams: [
        { type: "public-key", alg: -7 },    // ES256
        { type: "public-key", alg: -257 },  // RS256
        { type: "public-key", alg: -8 },    // EdDSA
      ],
      authenticatorSelection: { userVerification: "preferred", residentKey: "preferred" },
      timeout: 60000,
      attestation: "none",
      excludeCredentials: creds.map((c) => ({ type: "public-key", id: c.credential_id })),
    });
  }));

  app.post("/api/my/webauthn/register/verify", wrap(async (req, res) => {
    const uid = readMyUserId(req);
    if (!uid) return res.status(401).json({ error: "no_user" });
    const cr = req.body?.credential || {};
    const challenge = takeChallenge(`reg:${uid}`);
    if (!challenge) return res.status(400).json({ error: "challenge_expired" });
    const rawId = cr.rawId || cr.id;
    const resp = cr.response || {};
    if (!rawId || !resp.clientDataJSON || !resp.attestationObject)
      return res.status(400).json({ error: "bad_credential" });
    const clientDataJSON = fromB64url(resp.clientDataJSON);
    const cdErr = verifyClientData(clientDataJSON, "webauthn.create", challenge, rpIdFor(req));
    if (cdErr) return res.status(400).json({ error: cdErr });
    let authData, coseInfo;
    try {
      const att = cborDecode(fromB64url(resp.attestationObject)).value; // Map
      authData = att.get("authData");
      const parsed = parseAuthData(authData);
      if (!parsed.credId || !parsed.cosePub) return res.status(400).json({ error: "no_attested_key" });
      // rpIdHash debe coincidir con sha256(rpId)
      const expected = crypto.createHash("sha256").update(rpIdFor(req)).digest();
      if (!parsed.rpIdHash.equals(expected)) return res.status(400).json({ error: "rpid_mismatch" });
      coseInfo = coseToJwk(parsed.cosePub);
      var signCount = parsed.signCount;
      var credId = b64url(parsed.credId);
    } catch (e) {
      return res.status(400).json({ error: "parse_failed", detail: e.message });
    }
    const label = String(req.body?.label || "").slice(0, 120) ||
      (/(iphone|ipad|mac)/i.test(req.get("user-agent") || "") ? "Face ID / Touch ID" :
       /android/i.test(req.get("user-agent") || "") ? "Huella (Android)" : "Este dispositivo");
    try {
      await pool.execute(
        `INSERT INTO webauthn_credentials (user_id, credential_id, public_key, kty, sign_count, label)
         VALUES (?,?,?,?,?,?)
         ON DUPLICATE KEY UPDATE public_key=VALUES(public_key), sign_count=VALUES(sign_count), user_id=VALUES(user_id)`,
        [uid, credId, JSON.stringify(coseInfo.jwk), coseInfo.kty, signCount, label]
      );
    } catch (e) { return res.status(400).json({ error: "store_failed", detail: e.message }); }
    res.json({ ok: true, label });
  }));

  app.get("/api/my/webauthn/credentials", wrap(async (req, res) => {
    const uid = readMyUserId(req);
    if (!uid) return res.status(401).json({ error: "no_user" });
    const [items] = await pool.query(
      "SELECT id, label, kty, created_at, last_used_at FROM webauthn_credentials WHERE user_id=? ORDER BY id DESC", [uid]);
    res.json({ ok: true, items });
  }));

  app.delete("/api/my/webauthn/credentials/:id", wrap(async (req, res) => {
    const uid = readMyUserId(req);
    if (!uid) return res.status(401).json({ error: "no_user" });
    await pool.execute("DELETE FROM webauthn_credentials WHERE id=? AND user_id=?",
      [parseInt(req.params.id, 10) || 0, uid]);
    res.json({ ok: true });
  }));

  // === LOGIN (público) =============================================
  app.post("/api/webauthn/login/options", wrap(async (req, res) => {
    const email = String(req.body?.email || "").trim().toLowerCase();
    if (!email.includes("@")) return res.status(400).json({ error: "email_required" });
    const [uRows] = await pool.query("SELECT id FROM users WHERE email=? LIMIT 1", [email]);
    if (!uRows.length) return res.status(404).json({ error: "not_found" });
    const [creds] = await pool.query("SELECT credential_id FROM webauthn_credentials WHERE user_id=?", [uRows[0].id]);
    if (!creds.length) return res.status(404).json({ error: "no_credentials" });
    const challenge = crypto.randomBytes(32);
    putChallenge(`login:${email}`, challenge);
    res.json({
      ok: true,
      challenge: b64url(challenge),
      rpId: rpIdFor(req),
      timeout: 60000,
      userVerification: "preferred",
      allowCredentials: creds.map((c) => ({ type: "public-key", id: c.credential_id })),
    });
  }));

  app.post("/api/webauthn/login/verify", wrap(async (req, res) => {
    const email = String(req.body?.email || "").trim().toLowerCase();
    const cr = req.body?.credential || {};
    if (!email.includes("@")) return res.status(400).json({ error: "email_required" });
    const challenge = takeChallenge(`login:${email}`);
    if (!challenge) return res.status(400).json({ error: "challenge_expired" });
    const rawId = cr.rawId || cr.id;
    const resp = cr.response || {};
    if (!rawId || !resp.clientDataJSON || !resp.authenticatorData || !resp.signature)
      return res.status(400).json({ error: "bad_credential" });
    const clientDataJSON = fromB64url(resp.clientDataJSON);
    const cdErr = verifyClientData(clientDataJSON, "webauthn.get", challenge, rpIdFor(req));
    if (cdErr) return res.status(400).json({ error: cdErr });
    const credId = b64url(fromB64url(rawId));
    const [uRows] = await pool.query("SELECT id, email, name, role, plan, zone, photo_url FROM users WHERE email=? LIMIT 1", [email]);
    if (!uRows.length) return res.status(404).json({ error: "not_found" });
    const u = uRows[0];
    const [cRows] = await pool.query(
      "SELECT id, public_key, kty, sign_count FROM webauthn_credentials WHERE credential_id=? AND user_id=? LIMIT 1",
      [credId, u.id]);
    if (!cRows.length) return res.status(404).json({ error: "credential_not_found" });
    const credRow = cRows[0];
    const authDataBuf = fromB64url(resp.authenticatorData);
    // rpIdHash de authenticatorData debe coincidir con sha256(rpId)
    const expected = crypto.createHash("sha256").update(rpIdFor(req)).digest();
    if (!authDataBuf.subarray(0, 32).equals(expected)) return res.status(400).json({ error: "rpid_mismatch" });
    let ok = false;
    try {
      ok = verifySignature(credRow, authDataBuf, clientDataJSON, fromB64url(resp.signature));
    } catch (e) { return res.status(400).json({ error: "verify_failed", detail: e.message }); }
    if (!ok) return res.status(401).json({ error: "bad_signature" });
    // Actualiza contador y marca último uso (best-effort)
    try {
      const newCount = authDataBuf.readUInt32BE(33);
      await pool.execute("UPDATE webauthn_credentials SET sign_count=?, last_used_at=NOW() WHERE id=?", [newCount, credRow.id]);
      await pool.execute("UPDATE users SET last_login=NOW(), online=1 WHERE id=?", [u.id]);
    } catch {}
    if (typeof helpers.touchUserDevice === "function") { try { await helpers.touchUserDevice(req, u.id); } catch {} }
    if (typeof helpers.signUserToken !== "function") return res.status(500).json({ error: "no_token_signer" });
    res.json({ ok: true, user: u, auth_token: helpers.signUserToken(u.id) });
  }));
}

module.exports = { migrate, register };
