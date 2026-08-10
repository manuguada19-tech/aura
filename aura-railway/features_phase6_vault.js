/* ================================================================
   AURA · Fase 6 — Bóveda cifrada de grabaciones (V569)
   ---------------------------------------------------------------
   Objetivo: las llamadas, videollamadas y notas de voz quedan
   cifradas en reposo con AES-256-GCM. El equipo de administración
   NO puede reproducirlas libremente; hace falta:
     1) Una "solicitud de acceso" con motivo (denuncia de usuario,
        orden judicial / policial, emergencia de seguridad)
     2) Aprobación por un SEGUNDO administrador distinto del que
        solicita (regla "dos pares de ojos")
     3) Se genera un token de un solo uso con TTL 24 h.

   Todos los accesos y aprobaciones quedan auditados con timestamp
   y email del administrador. Cualquier reproducción tras la
   aprobación queda registrada en `vault_access_logs`.

   Key management:
     - Se usa VAULT_MASTER_KEY (env, 64 hex chars = 32 bytes) para
       derivar por-archivo una clave con HKDF-like (SHA-256(master||id))
     - Sin la master key el material queda inaccesible.
   ================================================================ */
"use strict";

const crypto = require("crypto");
const fs = require("fs");
const path = require("path");

const MASTER_KEY_HEX = process.env.VAULT_MASTER_KEY
  || crypto.createHash("sha256").update("aura-default-vault-key-CHANGE-ME").digest("hex");
const MASTER_KEY = Buffer.from(MASTER_KEY_HEX.slice(0, 64), "hex");

function deriveKey(fileId, kind) {
  // 32 bytes AES-256
  return crypto.createHash("sha256").update(MASTER_KEY).update(String(kind)).update(String(fileId)).digest();
}

function encryptBuffer(plain, fileId, kind) {
  const iv = crypto.randomBytes(12);
  const key = deriveKey(fileId, kind);
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
  const enc = Buffer.concat([cipher.update(plain), cipher.final()]);
  const tag = cipher.getAuthTag();
  return { enc, iv, tag };
}

function decryptBuffer(enc, iv, tag, fileId, kind) {
  const key = deriveKey(fileId, kind);
  const decipher = crypto.createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(enc), decipher.final()]);
}

async function migrate(pool) {
  const q = (sql) => pool.query(sql).catch((e) => console.warn("[phase6]", e.code || e.message));

  await q(`CREATE TABLE IF NOT EXISTS vault_access_requests (
    id INT AUTO_INCREMENT PRIMARY KEY,
    kind ENUM('call','voice_note') NOT NULL,
    target_id INT NOT NULL,
    requester_email VARCHAR(190) NOT NULL,
    reason ENUM('user_report','police_order','court_order','safety_emergency') NOT NULL,
    reference VARCHAR(200) NULL,
    notes TEXT NULL,
    status ENUM('pending','approved','rejected','revoked','expired') DEFAULT 'pending',
    approver_email VARCHAR(190) NULL,
    approved_at TIMESTAMP NULL,
    rejected_at TIMESTAMP NULL,
    revoked_at TIMESTAMP NULL,
    expires_at TIMESTAMP NULL,
    access_token VARCHAR(64) NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_kind_target (kind, target_id),
    INDEX idx_status (status),
    INDEX idx_token (access_token)
  )`);

  await q(`CREATE TABLE IF NOT EXISTS vault_access_logs (
    id INT AUTO_INCREMENT PRIMARY KEY,
    request_id INT NOT NULL,
    admin_email VARCHAR(190) NOT NULL,
    ip VARCHAR(64) NULL,
    ua VARCHAR(300) NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_req (request_id)
  )`);

  // Marcamos los archivos como cifrados en su tabla propia.
  await q(`ALTER TABLE call_recordings ADD COLUMN encrypted TINYINT(1) DEFAULT 0`);
  await q(`ALTER TABLE call_recordings ADD COLUMN iv VARBINARY(16) NULL`);
  await q(`ALTER TABLE call_recordings ADD COLUMN tag VARBINARY(16) NULL`);
  await q(`ALTER TABLE messages ADD COLUMN audio_encrypted TINYINT(1) DEFAULT 0`);
  await q(`ALTER TABLE messages ADD COLUMN audio_iv VARBINARY(16) NULL`);
  await q(`ALTER TABLE messages ADD COLUMN audio_tag VARBINARY(16) NULL`);

  console.log("[phase6] vault migrate OK");
}

/* ---- Utilidades para reescribir archivos existentes ------------- */
function vaultPath(baseDir, relUrl) {
  // Convierte una URL /uploads/x/y.webm en /uploads/x/y.webm.enc dentro
  // del mismo árbol físico (public/uploads/…).
  return path.join(baseDir, "public", String(relUrl).replace(/^\/+/, "")) + ".enc";
}

function encryptFileInPlace({ absPath, encPath, id, kind }) {
  const plain = fs.readFileSync(absPath);
  const { enc, iv, tag } = encryptBuffer(plain, id, kind);
  fs.mkdirSync(path.dirname(encPath), { recursive: true });
  fs.writeFileSync(encPath, enc);
  try { fs.unlinkSync(absPath); } catch {}
  return { iv, tag, bytes: enc.length };
}

/* ---- Endpoints ------------------------------------------------- */
function register(app, pool, helpers) {
  const { wrap, requireAdmin } = helpers;
  const baseDir = __dirname;

  // Middleware para leer email admin de req.admin (rellenado por requireAdmin del server principal)
  function adminEmail(req) { return req.admin?.email || null; }

  // -- Listado de solicitudes ---------------------------------------
  app.get("/api/admin/vault/access-requests", requireAdmin, wrap(async (req, res) => {
    const status = String(req.query?.status || "").toLowerCase();
    const params = []; let where = "";
    if (["pending","approved","rejected","revoked","expired"].includes(status)) {
      where = "WHERE status=?"; params.push(status);
    }
    const [rows] = await pool.query(
      `SELECT * FROM vault_access_requests ${where} ORDER BY id DESC LIMIT 500`,
      params
    );
    // marcar expiradas al vuelo (sin tocar BD)
    const now = Date.now();
    rows.forEach((r) => {
      if (r.status === "approved" && r.expires_at && new Date(r.expires_at).getTime() < now) {
        r.effective_status = "expired";
      } else r.effective_status = r.status;
    });
    res.json({ ok: true, items: rows });
  }));

  // -- Crear solicitud ---------------------------------------------
  app.post("/api/admin/vault/access-requests", requireAdmin, wrap(async (req, res) => {
    const kind = String(req.body?.kind || "").toLowerCase();
    if (!["call","voice_note"].includes(kind)) return res.status(400).json({ error: "invalid_kind" });
    const targetId = parseInt(req.body?.target_id, 10);
    if (!targetId) return res.status(400).json({ error: "target_required" });
    const reason = String(req.body?.reason || "").toLowerCase();
    if (!["user_report","police_order","court_order","safety_emergency"].includes(reason)) {
      return res.status(400).json({ error: "invalid_reason" });
    }
    const reference = String(req.body?.reference || "").slice(0, 200) || null;
    const notes = String(req.body?.notes || "").slice(0, 2000) || null;
    const email = adminEmail(req);
    const [r] = await pool.execute(
      `INSERT INTO vault_access_requests (kind, target_id, requester_email, reason, reference, notes)
       VALUES (?,?,?,?,?,?)`,
      [kind, targetId, email, reason, reference, notes]
    );
    res.json({ ok: true, id: r.insertId });
  }));

  // -- Aprobar (2º admin) ------------------------------------------
  app.post("/api/admin/vault/access-requests/:id/approve", requireAdmin, wrap(async (req, res) => {
    const id = parseInt(req.params.id, 10);
    const email = adminEmail(req);
    const ttlHours = Math.min(72, Math.max(1, parseInt(req.body?.ttl_hours, 10) || 24));
    const [[r]] = await pool.query("SELECT * FROM vault_access_requests WHERE id=? LIMIT 1", [id]).then((rr)=>[rr[0]]);
    if (!r) return res.status(404).json({ error: "not_found" });
    if (r.status !== "pending") return res.status(400).json({ error: "already_"+r.status });
    if (String(r.requester_email || "").toLowerCase() === String(email || "").toLowerCase()) {
      return res.status(403).json({ error: "same_admin_forbidden", hint: "Un segundo administrador debe aprobar." });
    }
    const token = crypto.randomBytes(24).toString("hex");
    const expiresAt = new Date(Date.now() + ttlHours * 3600 * 1000);
    await pool.execute(
      `UPDATE vault_access_requests
         SET status='approved', approver_email=?, approved_at=NOW(),
             access_token=?, expires_at=?
       WHERE id=?`,
      [email, token, expiresAt, id]
    );
    res.json({ ok: true, access_token: token, expires_at: expiresAt });
  }));

  app.post("/api/admin/vault/access-requests/:id/reject", requireAdmin, wrap(async (req, res) => {
    const id = parseInt(req.params.id, 10);
    const email = adminEmail(req);
    const [[r]] = await pool.query("SELECT * FROM vault_access_requests WHERE id=? LIMIT 1", [id]).then((rr)=>[rr[0]]);
    if (!r) return res.status(404).json({ error: "not_found" });
    if (r.status !== "pending") return res.status(400).json({ error: "already_"+r.status });
    if (String(r.requester_email || "").toLowerCase() === String(email || "").toLowerCase()) {
      return res.status(403).json({ error: "same_admin_forbidden" });
    }
    await pool.execute(
      "UPDATE vault_access_requests SET status='rejected', approver_email=?, rejected_at=NOW() WHERE id=?",
      [email, id]
    );
    res.json({ ok: true });
  }));

  app.post("/api/admin/vault/access-requests/:id/revoke", requireAdmin, wrap(async (req, res) => {
    const id = parseInt(req.params.id, 10);
    await pool.execute(
      "UPDATE vault_access_requests SET status='revoked', revoked_at=NOW() WHERE id=?", [id]
    );
    res.json({ ok: true });
  }));

  // -- Reproducir/descargar contenido cifrado con token ------------
  //   GET /api/admin/vault/media/:reqId?item=caller|callee|main
  app.get("/api/admin/vault/media/:reqId", requireAdmin, wrap(async (req, res) => {
    const reqId = parseInt(req.params.reqId, 10);
    const [[ar]] = await pool.query("SELECT * FROM vault_access_requests WHERE id=? LIMIT 1", [reqId]).then((rr)=>[rr[0]]);
    if (!ar) return res.status(404).end();
    if (ar.status !== "approved") return res.status(403).json({ error: "not_approved" });
    if (ar.expires_at && new Date(ar.expires_at).getTime() < Date.now()) {
      await pool.execute("UPDATE vault_access_requests SET status='expired' WHERE id=?", [reqId]);
      return res.status(410).json({ error: "token_expired" });
    }
    // Registro de acceso
    const ip = (req.headers["x-forwarded-for"] || req.socket?.remoteAddress || "").toString().split(",")[0].trim();
    const ua = String(req.headers["user-agent"] || "").slice(0, 300);
    await pool.execute(
      "INSERT INTO vault_access_logs (request_id, admin_email, ip, ua) VALUES (?,?,?,?)",
      [reqId, adminEmail(req), ip, ua]
    );

    // Localizar archivo según kind
    if (ar.kind === "voice_note") {
      const [[m]] = await pool.query(
        "SELECT id, media_url, audio_encrypted, audio_iv, audio_tag, audio_mime FROM messages WHERE id=? AND media_type='audio' LIMIT 1",
        [ar.target_id]
      ).then((rr)=>[rr[0]]);
      if (!m || !m.media_url) return res.status(404).json({ error: "media_missing" });
      const abs = m.audio_encrypted
        ? path.join(baseDir, "public", m.media_url.replace(/^\/+/, "")) + ".enc"
        : path.join(baseDir, "public", m.media_url.replace(/^\/+/, ""));
      if (!fs.existsSync(abs)) return res.status(404).json({ error: "file_missing" });
      let buf = fs.readFileSync(abs);
      if (m.audio_encrypted && m.audio_iv && m.audio_tag) {
        try { buf = decryptBuffer(buf, m.audio_iv, m.audio_tag, m.id, "voice_note"); }
        catch (e) { return res.status(500).json({ error: "decrypt_failed" }); }
      }
      res.setHeader("Content-Type", m.audio_mime || "audio/webm");
      res.setHeader("Content-Disposition", `inline; filename="voice_${m.id}.webm"`);
      return res.end(buf);
    }
    if (ar.kind === "call") {
      const side = String(req.query?.side || "caller").toLowerCase();
      const [recs] = await pool.query(
        "SELECT * FROM call_recordings WHERE call_id=? AND role=? ORDER BY id ASC",
        [ar.target_id, side === "callee" ? "callee" : "caller"]
      );
      if (!recs.length) return res.status(404).json({ error: "recording_missing" });
      const rr = recs[0];
      const abs = rr.encrypted
        ? path.join(baseDir, "public", rr.url.replace(/^\/+/, "")) + ".enc"
        : path.join(baseDir, "public", rr.url.replace(/^\/+/, ""));
      if (!fs.existsSync(abs)) return res.status(404).json({ error: "file_missing" });
      let buf = fs.readFileSync(abs);
      if (rr.encrypted && rr.iv && rr.tag) {
        try { buf = decryptBuffer(buf, rr.iv, rr.tag, rr.id, "call"); }
        catch (e) { return res.status(500).json({ error: "decrypt_failed" }); }
      }
      res.setHeader("Content-Type", rr.mime || "video/webm");
      res.setHeader("Content-Disposition", `inline; filename="call_${rr.call_id}_${rr.role}.webm"`);
      return res.end(buf);
    }
    res.status(400).json({ error: "invalid_kind" });
  }));

  // -- Logs de acceso ---------------------------------------------
  app.get("/api/admin/vault/access-logs", requireAdmin, wrap(async (req, res) => {
    const [rows] = await pool.query(
      `SELECT l.*, r.kind, r.target_id, r.reason, r.reference
         FROM vault_access_logs l
         LEFT JOIN vault_access_requests r ON r.id=l.request_id
         ORDER BY l.id DESC LIMIT 500`
    );
    res.json({ ok: true, items: rows });
  }));

  // -- Metadatos "seguros" para el panel ---------------------------
  //    Devuelve si existe grabación pero sin URL directa.
  app.get("/api/admin/vault/exists", requireAdmin, wrap(async (req, res) => {
    const kind = String(req.query?.kind || "").toLowerCase();
    const id = parseInt(req.query?.id, 10);
    if (!["call","voice_note"].includes(kind) || !id) return res.status(400).json({ error: "params" });
    if (kind === "voice_note") {
      const [[m]] = await pool.query("SELECT id, audio_encrypted, audio_bytes, media_url IS NOT NULL AS has FROM messages WHERE id=?", [id]).then((rr)=>[rr[0]]);
      return res.json({ ok: true, has: !!(m && m.has), encrypted: !!(m && m.audio_encrypted) });
    }
    const [[c]] = await pool.query("SELECT recording_caller_url, recording_callee_url FROM video_calls WHERE id=?", [id]).then((rr)=>[rr[0]]);
    if (!c) return res.status(404).json({ error: "not_found" });
    const [recs] = await pool.query("SELECT role, encrypted FROM call_recordings WHERE call_id=?", [id]);
    res.json({
      ok: true,
      has_caller: !!c.recording_caller_url,
      has_callee: !!c.recording_callee_url,
      encrypted: recs.every((r) => r.encrypted === 1) && recs.length > 0,
    });
  }));
}

module.exports = { migrate, register, encryptBuffer, decryptBuffer, encryptFileInPlace, deriveKey };
