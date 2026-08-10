/* ================================================================
   AURA — Features FASE 4
     - Traducción automática de chat  (Platino)
     - Moderación IA (detección local heurística sin coste externo)
     - Video-llamada WebRTC 1-a-1 (signaling en memoria + SSE)  (Platino)
     - Push contextuales ("te vieron", "match cerca", etc.)
   ================================================================ */
const { planAtLeast } = require("./features_phase1");
// V558 · grants por función (permite acceso individual sin cambiar de plan)
let __phase5 = null;
try { __phase5 = require("./features_phase5"); } catch {}
// V569 · Bóveda cifrada
let __vault = null;
try { __vault = require("./features_phase6_vault"); } catch {}
async function canUse(pool, userId, feature, minPlan) {
  if (__phase5 && typeof __phase5.hasFeature === "function") {
    try { return await __phase5.hasFeature(pool, userId, feature); } catch {}
  }
  const plan = await getUserPlan(pool, userId);
  return planAtLeast(plan, minPlan);
}

// ---- Moderación heurística sin API externa ---------------------------
const BAD_WORDS_ES = ["puta","gilipollas","cabron","mierda","joder","maricon","zorra","hijoputa"];
const SPAM_PATTERNS = [
  /https?:\/\/\S+/i,               // URL
  /whatsapp|telegram|tlgrm/i,      // fuera de plataforma
  /\+?\d{2,3}[\s-]?\d{2,3}[\s-]?\d{3,4}[\s-]?\d{3,4}/, // teléfono
  /\b(?:bitcoin|btc|onlyfans|ganar dinero|inversión rápida)\b/i,
];
const NSFW_HINTS = /\b(?:sexo|desnud|xxx|porno|nudes|paja|polla|coño)\b/i;

function scoreMessage(text) {
  const t = String(text || "").toLowerCase();
  let score = 0; const flags = [];
  for (const w of BAD_WORDS_ES) if (t.includes(w)) { score += 20; flags.push("insult:"+w); }
  for (const rx of SPAM_PATTERNS) if (rx.test(t)) { score += 40; flags.push("spam:"+rx.source.slice(0,30)); }
  if (NSFW_HINTS.test(t)) { score += 30; flags.push("nsfw"); }
  const capsRatio = (t.replace(/[^A-Z]/g,"").length) / Math.max(1, text?.length||1);
  if (capsRatio > 0.6 && text?.length > 15) { score += 10; flags.push("shouting"); }
  return { score, flags };
}

async function migrate(pool) {
  const q = (sql) => pool.query(sql).catch((e) => console.warn("[phase4]", e.code || e.message));

  await q(`CREATE TABLE IF NOT EXISTS moderation_flags (
    id INT AUTO_INCREMENT PRIMARY KEY,
    message_id INT NULL,
    user_id INT NULL,
    kind VARCHAR(40) NOT NULL,
    score INT DEFAULT 0,
    flags TEXT NULL,
    status ENUM('pending','ok','warned','banned','ignored') DEFAULT 'pending',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_status (status), INDEX idx_user (user_id)
  )`);

  await q(`CREATE TABLE IF NOT EXISTS message_translations (
    id INT AUTO_INCREMENT PRIMARY KEY,
    message_id INT NOT NULL,
    target_lang VARCHAR(8) NOT NULL,
    translated_text TEXT NOT NULL,
    provider VARCHAR(24) DEFAULT 'noop',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY unq (message_id, target_lang)
  )`);

  await q(`CREATE TABLE IF NOT EXISTS video_calls (
    id INT AUTO_INCREMENT PRIMARY KEY,
    caller_id INT NOT NULL,
    callee_id INT NOT NULL,
    room_id VARCHAR(64) NOT NULL UNIQUE,
    status ENUM('ringing','accepted','rejected','ended','missed') DEFAULT 'ringing',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    ended_at TIMESTAMP NULL,
    INDEX idx_callee (callee_id), INDEX idx_caller (caller_id)
  )`);

  // V567 · Grabación de llamadas para monitorización y auditoría.
  //   Cada participante sube su pista local (audio+video propio).
  //   Legalmente, el usuario acepta al iniciar/aceptar la llamada con
  //   el banner "🔴 REC" siempre visible + cláusula en términos.
  await q(`ALTER TABLE video_calls ADD COLUMN recording_caller_url VARCHAR(500) NULL`);
  await q(`ALTER TABLE video_calls ADD COLUMN recording_callee_url VARCHAR(500) NULL`);
  await q(`ALTER TABLE video_calls ADD COLUMN recording_bytes INT NULL`);
  await q(`ALTER TABLE video_calls ADD COLUMN department ENUM('safety','quality','legal','support','none') DEFAULT 'none'`);
  await q(`ALTER TABLE video_calls ADD COLUMN triage_flags TEXT NULL`);
  await q(`ALTER TABLE video_calls ADD COLUMN triage_score INT DEFAULT 0`);
  await q(`ALTER TABLE video_calls ADD COLUMN notes TEXT NULL`);
  await q(`ALTER TABLE video_calls ADD COLUMN mode VARCHAR(10) DEFAULT 'video'`);

  await q(`CREATE TABLE IF NOT EXISTS call_recordings (
    id INT AUTO_INCREMENT PRIMARY KEY,
    call_id INT NOT NULL,
    user_id INT NOT NULL,
    role ENUM('caller','callee') NOT NULL,
    mime VARCHAR(64) NULL,
    bytes INT NULL,
    duration_ms INT NULL,
    url VARCHAR(500) NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_call (call_id), INDEX idx_user (user_id)
  )`);

  await q(`CREATE TABLE IF NOT EXISTS push_context_events (
    id INT AUTO_INCREMENT PRIMARY KEY,
    user_id INT NOT NULL,
    kind VARCHAR(40) NOT NULL,
    payload JSON NULL,
    delivered TINYINT(1) DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_user (user_id), INDEX idx_delivered (delivered)
  )`);

  console.log("[phase4] migrate OK");
}

async function getUserPlan(pool, userId) {
  if (!userId) return "free";
  const [r] = await pool.query("SELECT plan FROM users WHERE id=? LIMIT 1", [userId]);
  return (r[0]?.plan || "free").toLowerCase();
}

// Signaling en memoria (para no depender de infra Socket.io)
// Nota: apto para instancia única. Para varias replicas necesitarías Redis.
const signalingRooms = new Map(); // roomId -> [{userId, res}] SSE listeners

function pushSignal(roomId, msg) {
  const list = signalingRooms.get(roomId) || [];
  for (const s of list) {
    try { s.res.write(`data: ${JSON.stringify(msg)}\n\n`); } catch {}
  }
}

function register(app, pool, helpers) {
  const { readMyUserId, wrap, requireAdmin } = helpers;

  // ==== Moderación IA (aplicable a mensajes) ====================
  // El backend antiguo mantiene POST /api/my/messages sin cambios.
  // Añadimos endpoint que llama módulo scoreMessage + guarda flag.
  app.post("/api/my/moderation/score", wrap(async (req, res) => {
    const me = readMyUserId(req);
    if (!me) return res.status(401).json({ error: "unauthorized" });
    const text = String(req.body?.text || "").slice(0, 4000);
    const r = scoreMessage(text);
    if (r.score >= 30) {
      await pool.execute(
        "INSERT INTO moderation_flags (message_id,user_id,kind,score,flags,status) VALUES (?,?,?,?,?, 'pending')",
        [req.body?.message_id || null, me, "text", r.score, r.flags.join(",")]
      );
    }
    res.json({ ok: true, score: r.score, flags: r.flags, blocked: r.score >= 70 });
  }));

  // Admin: cola de moderación
  app.get("/api/admin/moderation/queue", requireAdmin, wrap(async (req, res) => {
    const [rows] = await pool.query(
      `SELECT mf.*, u.name, u.email FROM moderation_flags mf
         LEFT JOIN users u ON u.id = mf.user_id
        WHERE mf.status = 'pending' ORDER BY mf.score DESC, mf.created_at DESC LIMIT 200`
    );
    res.json({ ok: true, items: rows });
  }));
  app.put("/api/admin/moderation/:id", requireAdmin, wrap(async (req, res) => {
    const status = ["ok","warned","banned","ignored"].includes(req.body?.status) ? req.body.status : "ignored";
    await pool.execute("UPDATE moderation_flags SET status=? WHERE id=?", [status, parseInt(req.params.id,10)]);
    res.json({ ok: true });
  }));
  app.get("/api/admin/moderation/stats", requireAdmin, wrap(async (req, res) => {
    const [tot] = await pool.query("SELECT status, COUNT(*) c FROM moderation_flags GROUP BY status");
    res.json({ ok: true, by_status: tot });
  }));

  // ==== Traducción automática (Platino) =========================
  // Sin API externa: usamos un dictionary muy básico ES-EN + passthrough.
  // Marcamos provider='noop' para saber que se puede sustituir por DeepL cuando el usuario configure la key.
  function translateBasic(text, targetLang) {
    if (!text) return "";
    if (targetLang === "en") {
      const m = { "hola":"hi","adios":"bye","gracias":"thanks","¿cómo estás?":"how are you?","te quiero":"i love you","buenos días":"good morning","buenas noches":"good night" };
      let out = text;
      for (const [k,v] of Object.entries(m)) {
        out = out.replace(new RegExp(k, "gi"), v);
      }
      return out;
    }
    return text;
  }

  app.post("/api/my/messages/:id/translate", wrap(async (req, res) => {
    const me = readMyUserId(req);
    if (!me) return res.status(401).json({ error: "unauthorized" });
    if (!(await canUse(pool, me, "translate", "platinum"))) {
      return res.status(402).json({ error: "plan_required", required_plan: "platinum" });
    }
    const mid = parseInt(req.params.id, 10);
    const target = String(req.body?.target_lang || "en").slice(0,8);
    const [[msg]] = await pool.query("SELECT id, body FROM messages WHERE id=?", [mid]).then((rr)=>[rr[0]]);
    if (!msg) return res.status(404).json({ error: "not_found" });
    const [cached] = await pool.query("SELECT translated_text FROM message_translations WHERE message_id=? AND target_lang=?", [mid, target]);
    if (cached[0]) return res.json({ ok: true, translated: cached[0].translated_text, cached: true });
    const translated = translateBasic(msg.body || "", target);
    await pool.execute(
      "INSERT INTO message_translations (message_id,target_lang,translated_text,provider) VALUES (?,?,?,?)",
      [mid, target, translated, "noop"]
    );
    res.json({ ok: true, translated, cached: false });
  }));

  // ==== Video-llamada WebRTC (Platino) ==========================
  // Iniciar llamada: crea sala, notifica al callee vía SSE.
  app.post("/api/my/video/start", wrap(async (req, res) => {
    const me = readMyUserId(req);
    if (!me) return res.status(401).json({ error: "unauthorized" });
    // V558 · audio-only también soportado. mode: "video"|"audio"
    const mode = req.body?.mode === "audio" ? "audio" : "video";
    const feature = mode === "audio" ? "audio_call" : "video_call";
    const minPlan = mode === "audio" ? "gold" : "platinum";
    if (!(await canUse(pool, me, feature, minPlan))) {
      return res.status(402).json({ error: "plan_required", required_plan: minPlan, feature });
    }
    const callee = parseInt(req.body?.callee_id, 10);
    if (!callee) return res.status(400).json({ error: "callee_required" });
    const roomId = `room_${me}_${callee}_${Date.now().toString(36)}`;
    const [r] = await pool.execute(
      "INSERT INTO video_calls (caller_id,callee_id,room_id,status,mode) VALUES (?,?,?, 'ringing', ?)",
      [me, callee, roomId, mode]
    );
    // V565 · Nombre del caller para mostrar en el modal del callee
    let callerName = null;
    try {
      const [[cu]] = await pool.query("SELECT name FROM users WHERE id=? LIMIT 1", [me]).then((rr)=>[rr[0]]);
      callerName = cu?.name || null;
    } catch {}
    // Push contextual al callee (incluye modo)
    await pool.execute(
      "INSERT INTO push_context_events (user_id,kind,payload) VALUES (?,?, ?)",
      [callee, "video_call_incoming", JSON.stringify({ room_id: roomId, caller_id: me, call_id: r.insertId, mode, caller_name: callerName })]
    );
    pushSignal(roomId, { type: "incoming", caller_id: me, callee_id: callee, room_id: roomId, mode });
    res.json({ ok: true, call_id: r.insertId, room_id: roomId, mode, ice_servers: [{ urls: "stun:stun.l.google.com:19302" }] });
  }));

  app.post("/api/my/video/:call_id/accept", wrap(async (req, res) => {
    const me = readMyUserId(req);
    if (!me) return res.status(401).json({ error: "unauthorized" });
    const cid = parseInt(req.params.call_id, 10);
    const [[c]] = await pool.query("SELECT * FROM video_calls WHERE id=? AND callee_id=?", [cid, me]).then((rr)=>[rr[0]]);
    if (!c) return res.status(404).json({ error: "not_found" });
    await pool.execute("UPDATE video_calls SET status='accepted' WHERE id=?", [cid]);
    pushSignal(c.room_id, { type: "accepted", by: me });
    res.json({ ok: true, room_id: c.room_id, ice_servers: [{ urls: "stun:stun.l.google.com:19302" }] });
  }));

  app.post("/api/my/video/:call_id/end", wrap(async (req, res) => {
    const me = readMyUserId(req);
    if (!me) return res.status(401).json({ error: "unauthorized" });
    const cid = parseInt(req.params.call_id, 10);
    const [[c]] = await pool.query("SELECT * FROM video_calls WHERE id=? AND (caller_id=? OR callee_id=?)", [cid, me, me]).then((rr)=>[rr[0]]);
    if (!c) return res.status(404).json({ error: "not_found" });
    await pool.execute("UPDATE video_calls SET status='ended', ended_at=NOW() WHERE id=?", [cid]);
    pushSignal(c.room_id, { type: "ended", by: me });
    // V567 · triage inicial al cerrar (aunque las grabaciones aún no hayan subido).
    // Se re-ejecuta al recibir cada grabación para refinar.
    setTimeout(() => { autoTriageCall(pool, cid).catch(()=>{}); }, 500);
    res.json({ ok: true });
  }));

  // SSE signaling: escuchar señales de una sala
  app.get("/api/my/video/room/:room_id/signal", (req, res) => {
    const me = require("./features_phase1"); // dummy import
    const uid = helpers.readMyUserId(req);
    if (!uid) return res.status(401).end();
    const roomId = String(req.params.room_id).slice(0,120);
    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");
    res.flushHeaders?.();
    const list = signalingRooms.get(roomId) || [];
    list.push({ userId: uid, res });
    signalingRooms.set(roomId, list);
    req.on("close", () => {
      const cur = signalingRooms.get(roomId) || [];
      signalingRooms.set(roomId, cur.filter((s) => s.res !== res));
    });
  });

  // Signaling: enviar SDP/ICE al otro
  app.post("/api/my/video/room/:room_id/signal", wrap(async (req, res) => {
    const me = readMyUserId(req);
    if (!me) return res.status(401).json({ error: "unauthorized" });
    const roomId = String(req.params.room_id).slice(0,120);
    const msg = { from: me, ...(req.body || {}) };
    pushSignal(roomId, msg);
    res.json({ ok: true });
  }));

  // V567 · Subir grabación local del participante al colgar.
  // Body: { data_url: "data:video/webm;base64,...", duration_ms }
  // Guarda archivo en /uploads/calls/YYYY/MM/callId_role_hash.webm
  app.post("/api/my/video/:call_id/recording", wrap(async (req, res) => {
    const me = readMyUserId(req);
    if (!me) return res.status(401).json({ error: "unauthorized" });
    const cid = parseInt(req.params.call_id, 10);
    const [[c]] = await pool.query(
      "SELECT * FROM video_calls WHERE id=? AND (caller_id=? OR callee_id=?)",
      [cid, me, me]
    ).then((rr)=>[rr[0]]);
    if (!c) return res.status(404).json({ error: "not_found" });
    const role = c.caller_id === me ? "caller" : "callee";
    const dataUrl = String(req.body?.data_url || "");
    const duration_ms = parseInt(req.body?.duration_ms, 10) || 0;
    const m = /^data:(video\/[a-z0-9+.-]+|audio\/[a-z0-9+.-]+);base64,(.+)$/i.exec(dataUrl);
    if (!m) return res.status(400).json({ error: "invalid_data_url" });
    const mime = m[1].toLowerCase();
    const buf = Buffer.from(m[2], "base64");
    // Máx 50 MB por participante (llamada corta). El caller/callee lo trocean si es larga.
    if (buf.length > 50 * 1024 * 1024) return res.status(413).json({ error: "too_large" });
    if (buf.length < 500) return res.status(400).json({ error: "empty" });
    const ext = mime.includes("webm") ? "webm"
              : mime.includes("mp4") ? "mp4"
              : mime.includes("ogg") ? "ogg"
              : mime.includes("mpeg") ? "mp3"
              : "bin";
    const fs = require("fs");
    const path = require("path");
    const crypto = require("crypto");
    const hash = crypto.createHash("sha1").update(buf).digest("hex").slice(0, 16);
    const now = new Date();
    const yyyy = String(now.getUTCFullYear());
    const mm = String(now.getUTCMonth() + 1).padStart(2, "0");
    const dir = path.join(__dirname, "public", "uploads", "calls", yyyy, mm);
    try { fs.mkdirSync(dir, { recursive: true }); } catch {}
    const fname = `${cid}_${role}_${hash}.${ext}`;
    const url = `/uploads/calls/${yyyy}/${mm}/${fname}`;
    // V569 · Cifrado en reposo. La URL se conserva como referencia lógica;
    // el archivo físico es .enc y solo se descifra desde
    // /api/admin/vault/media/:reqId con un token aprobado por 2 admins.
    let iv = null, tag = null, encrypted = 0;
    let toWrite = buf;
    let abs = path.join(dir, fname);
    if (__vault && typeof __vault.encryptBuffer === "function") {
      try {
        const encRes = __vault.encryptBuffer(buf, fname, "call");
        toWrite = encRes.enc; iv = encRes.iv; tag = encRes.tag; encrypted = 1;
        abs = abs + ".enc";
      } catch (e) { console.warn("[call vault]", e.message); }
    }
    try { fs.writeFileSync(abs, toWrite); } catch (e) {
      console.error("[call rec] write error", e);
      return res.status(500).json({ error: "write_failed" });
    }
    await pool.execute(
      `INSERT INTO call_recordings
         (call_id,user_id,role,mime,bytes,duration_ms,url,encrypted,iv,tag)
       VALUES (?,?,?,?,?,?,?,?,?,?)`,
      [cid, me, role, mime, buf.length, duration_ms, url, encrypted, iv, tag]
    );
    const col = role === "caller" ? "recording_caller_url" : "recording_callee_url";
    await pool.execute(
      `UPDATE video_calls SET ${col}=?, recording_bytes=IFNULL(recording_bytes,0)+? WHERE id=?`,
      [url, buf.length, cid]
    );
    // Auto-triage cuando ya tengamos las dos partes
    try { await autoTriageCall(pool, cid); } catch {}
    res.json({ ok: true, url, bytes: buf.length, role });
  }));

  // Admin video-llamadas
  app.get("/api/admin/video/calls", requireAdmin, wrap(async (req, res) => {
    const dept = String(req.query?.department || "").toLowerCase();
    const params = [];
    let where = "";
    if (dept && ["safety","quality","legal","support","none"].includes(dept)) {
      where = "WHERE v.department=?";
      params.push(dept);
    }
    const [rows] = await pool.query(
      `SELECT v.*, ca.name AS caller_name, ce.name AS callee_name
         FROM video_calls v
         LEFT JOIN users ca ON ca.id=v.caller_id
         LEFT JOIN users ce ON ce.id=v.callee_id
        ${where}
        ORDER BY v.created_at DESC LIMIT 500`,
      params
    );
    res.json({ ok: true, items: rows });
  }));

  // V567 · Detalle de una llamada + sus grabaciones.
  app.get("/api/admin/video/calls/:id", requireAdmin, wrap(async (req, res) => {
    const id = parseInt(req.params.id, 10);
    const [[c]] = await pool.query(
      `SELECT v.*, ca.name AS caller_name, ca.email AS caller_email,
              ce.name AS callee_name, ce.email AS callee_email
         FROM video_calls v
         LEFT JOIN users ca ON ca.id=v.caller_id
         LEFT JOIN users ce ON ce.id=v.callee_id
        WHERE v.id=? LIMIT 1`, [id]
    ).then((rr)=>[rr[0]]);
    if (!c) return res.status(404).json({ error: "not_found" });
    const [recs] = await pool.query(
      "SELECT * FROM call_recordings WHERE call_id=? ORDER BY id ASC", [id]
    );
    res.json({ ok: true, call: c, recordings: recs });
  }));

  // V567 · Asignar/actualizar departamento de una llamada.
  app.patch("/api/admin/video/calls/:id/department", requireAdmin, wrap(async (req, res) => {
    const id = parseInt(req.params.id, 10);
    const dept = String(req.body?.department || "").toLowerCase();
    if (!["safety","quality","legal","support","none"].includes(dept)) {
      return res.status(400).json({ error: "invalid_department" });
    }
    const notes = req.body?.notes != null ? String(req.body.notes).slice(0, 2000) : null;
    await pool.execute(
      "UPDATE video_calls SET department=?, notes=COALESCE(?, notes) WHERE id=?",
      [dept, notes, id]
    );
    res.json({ ok: true });
  }));

  // V567 · Re-ejecutar triage manualmente.
  app.post("/api/admin/video/calls/:id/triage", requireAdmin, wrap(async (req, res) => {
    const id = parseInt(req.params.id, 10);
    const r = await autoTriageCall(pool, id);
    res.json({ ok: true, ...r });
  }));

  // V567 · Borrar grabaciones de una llamada (retención / RGPD).
  app.delete("/api/admin/video/calls/:id/recordings", requireAdmin, wrap(async (req, res) => {
    const id = parseInt(req.params.id, 10);
    const [recs] = await pool.query("SELECT url FROM call_recordings WHERE call_id=?", [id]);
    const fs = require("fs");
    const path = require("path");
    for (const r of recs) {
      const abs = path.join(__dirname, "public", r.url.replace(/^\/+/, ""));
      try { fs.unlinkSync(abs); } catch {}
    }
    await pool.execute("DELETE FROM call_recordings WHERE call_id=?", [id]);
    await pool.execute(
      "UPDATE video_calls SET recording_caller_url=NULL, recording_callee_url=NULL, recording_bytes=0 WHERE id=?",
      [id]
    );
    res.json({ ok: true, deleted: recs.length });
  }));

  // ==== Push contextuales ========================================
  app.get("/api/my/push/context", wrap(async (req, res) => {
    const me = readMyUserId(req);
    if (!me) return res.status(401).json({ error: "unauthorized" });
    const [rows] = await pool.query(
      "SELECT id, kind, payload, created_at FROM push_context_events WHERE user_id=? AND delivered=0 ORDER BY created_at DESC LIMIT 20",
      [me]
    );
    if (rows.length) {
      await pool.query("UPDATE push_context_events SET delivered=1 WHERE user_id=?", [me]);
    }
    res.json({ ok: true, events: rows });
  }));

  // Emisor genérico usado por otros módulos: exponer helper
  app.locals.emitContextEvent = async (userId, kind, payload = {}) => {
    try {
      await pool.execute("INSERT INTO push_context_events (user_id,kind,payload) VALUES (?,?,?)", [userId, kind, JSON.stringify(payload)]);
    } catch (e) { console.warn("[phase4 emit]", e.code || e.message); }
  };

  // Endpoint admin para inspeccionar
  app.get("/api/admin/push/context", requireAdmin, wrap(async (req, res) => {
    const [rows] = await pool.query("SELECT * FROM push_context_events ORDER BY id DESC LIMIT 500");
    res.json({ ok: true, items: rows });
  }));

  // ---- ADMIN: bulk delete ----
  app.post("/api/admin/moderation/bulk-delete", requireAdmin, wrap(async (req, res) => {
    const ids = Array.isArray(req.body?.ids) ? req.body.ids.map((x) => parseInt(x,10)).filter(Number.isFinite) : [];
    if (req.body?.all === true) {
      const [r] = await pool.execute("DELETE FROM moderation_flags");
      return res.json({ ok: true, deleted: r.affectedRows });
    }
    if (!ids.length) return res.json({ ok: true, deleted: 0 });
    const [r] = await pool.query(`DELETE FROM moderation_flags WHERE id IN (${ids.map(()=>"?").join(",")})`, ids);
    res.json({ ok: true, deleted: r.affectedRows });
  }));
  app.delete("/api/admin/moderation/:id", requireAdmin, wrap(async (req, res) => {
    // borrado individual definitivo (además del PUT que sólo cambia status)
    if (req.query?.hard === "1") {
      await pool.execute("DELETE FROM moderation_flags WHERE id=?", [parseInt(req.params.id,10)]);
      return res.json({ ok: true });
    }
    res.status(400).json({ error: "use hard=1 to delete" });
  }));
  app.post("/api/admin/video/calls/bulk-delete", requireAdmin, wrap(async (req, res) => {
    const ids = Array.isArray(req.body?.ids) ? req.body.ids.map((x) => parseInt(x,10)).filter(Number.isFinite) : [];
    if (req.body?.all === true) {
      const [r] = await pool.execute("DELETE FROM video_calls");
      return res.json({ ok: true, deleted: r.affectedRows });
    }
    if (!ids.length) return res.json({ ok: true, deleted: 0 });
    const [r] = await pool.query(`DELETE FROM video_calls WHERE id IN (${ids.map(()=>"?").join(",")})`, ids);
    res.json({ ok: true, deleted: r.affectedRows });
  }));
  app.post("/api/admin/push/context/bulk-delete", requireAdmin, wrap(async (req, res) => {
    const ids = Array.isArray(req.body?.ids) ? req.body.ids.map((x) => parseInt(x,10)).filter(Number.isFinite) : [];
    if (req.body?.all === true) {
      const [r] = await pool.execute("DELETE FROM push_context_events");
      return res.json({ ok: true, deleted: r.affectedRows });
    }
    if (!ids.length) return res.json({ ok: true, deleted: 0 });
    const [r] = await pool.query(`DELETE FROM push_context_events WHERE id IN (${ids.map(()=>"?").join(",")})`, ids);
    res.json({ ok: true, deleted: r.affectedRows });
  }));

  console.log("[phase4] endpoints registered");
}

// V567 · Auto-triage de una llamada al terminar (o cuando lo solicite admin).
//   Reglas heurísticas ligeras (sin IA externa):
//     - Duración < 3 s   → "quality" (posible fallo técnico)
//     - Solo 1 grabación → "quality" (uno de los dos no envió su pista)
//     - status='rejected' o 'missed' → "support"
//     - Reportes activos entre esos usuarios → "safety"
//     - Palabras clave en 'notes'/'triage_flags' previas → "safety" / "legal"
//     - Todo OK y ambas partes grabadas → "none"
async function autoTriageCall(pool, callId) {
  const [[c]] = await pool.query("SELECT * FROM video_calls WHERE id=? LIMIT 1", [callId]).then((rr)=>[rr[0]]);
  if (!c) return { skipped: true };
  const [recs] = await pool.query("SELECT role, bytes, duration_ms FROM call_recordings WHERE call_id=?", [callId]);
  const durMs = c.ended_at && c.created_at
    ? (new Date(c.ended_at).getTime() - new Date(c.created_at).getTime()) : 0;
  const flags = []; let dept = "none"; let score = 0;
  if (c.status === "rejected" || c.status === "missed") { dept = "support"; flags.push("no_answer"); score += 10; }
  else if (durMs > 0 && durMs < 3000) { dept = "quality"; flags.push("too_short"); score += 20; }
  else if (recs.length === 0) { dept = "quality"; flags.push("no_recording"); score += 30; }
  else if (recs.length === 1) { dept = "quality"; flags.push("one_side_only"); score += 20; }
  // Reportes cruzados entre los dos usuarios (si existe la tabla).
  try {
    const [[rep]] = await pool.query(
      `SELECT COUNT(*) c FROM reports
       WHERE (reporter_id=? AND target_id=?) OR (reporter_id=? AND target_id=?)`,
      [c.caller_id, c.callee_id, c.callee_id, c.caller_id]
    ).then((rr)=>[rr[0]]);
    if (rep && rep.c > 0) { dept = "safety"; flags.push("reported_between_users"); score += 50; }
  } catch {}
  await pool.execute(
    "UPDATE video_calls SET department=?, triage_flags=?, triage_score=? WHERE id=?",
    [dept, flags.join(","), score, callId]
  );
  return { department: dept, flags, score };
}

module.exports = { migrate, register, scoreMessage };
