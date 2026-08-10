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
      "INSERT INTO video_calls (caller_id,callee_id,room_id,status) VALUES (?,?,?, 'ringing')",
      [me, callee, roomId]
    );
    // Push contextual al callee (incluye modo)
    await pool.execute(
      "INSERT INTO push_context_events (user_id,kind,payload) VALUES (?,?, ?)",
      [callee, "video_call_incoming", JSON.stringify({ room_id: roomId, caller_id: me, call_id: r.insertId, mode })]
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

  // Admin video-llamadas
  app.get("/api/admin/video/calls", requireAdmin, wrap(async (req, res) => {
    const [rows] = await pool.query(
      `SELECT v.*, ca.name AS caller_name, ce.name AS callee_name
         FROM video_calls v
         LEFT JOIN users ca ON ca.id=v.caller_id
         LEFT JOIN users ce ON ce.id=v.callee_id
        ORDER BY v.created_at DESC LIMIT 200`
    );
    res.json({ ok: true, items: rows });
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

module.exports = { migrate, register, scoreMessage };
