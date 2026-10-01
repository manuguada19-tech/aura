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

  // Columnas y tabla heredadas de versiones anteriores. V1002 no escribe
  // contenido nuevo; se mantienen para no borrar datos existentes al migrar.
  await q(`ALTER TABLE video_calls ADD COLUMN recording_caller_url VARCHAR(500) NULL`);
  await q(`ALTER TABLE video_calls ADD COLUMN recording_callee_url VARCHAR(500) NULL`);
  await q(`ALTER TABLE video_calls ADD COLUMN recording_bytes INT NULL`);
  await q(`ALTER TABLE video_calls ADD COLUMN department ENUM('safety','quality','legal','support','none') DEFAULT 'none'`);
  await q(`ALTER TABLE video_calls ADD COLUMN triage_flags TEXT NULL`);
  await q(`ALTER TABLE video_calls ADD COLUMN triage_score INT DEFAULT 0`);
  await q(`ALTER TABLE video_calls ADD COLUMN notes TEXT NULL`);
  await q(`ALTER TABLE video_calls ADD COLUMN mode VARCHAR(10) DEFAULT 'video'`);
  // V1002 · Ciclo de vida y diagnóstico sin guardar el contenido de la llamada.
  await q(`ALTER TABLE video_calls ADD COLUMN accepted_at TIMESTAMP NULL`);
  await q(`ALTER TABLE video_calls ADD COLUMN last_signal_at TIMESTAMP NULL`);
  await q(`ALTER TABLE video_calls ADD COLUMN ended_reason VARCHAR(40) NULL`);

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
const signalingBacklog = new Map(); // roomId -> señales recientes para evitar carreras offer/answer
const callEventStreams = new Map(); // userId -> Set<res> para llamadas entrantes inmediatas

function pushSignal(roomId, msg) {
  const backlog = signalingBacklog.get(roomId) || [];
  backlog.push(msg);
  signalingBacklog.set(roomId, backlog.slice(-80));
  const list = signalingRooms.get(roomId) || [];
  for (const s of list) {
    if (msg.from && Number(msg.from) === Number(s.userId)) continue;
    try { s.res.write(`data: ${JSON.stringify(msg)}\n\n`); } catch {}
  }
}

function pushCallEvent(userId, payload) {
  const streams = callEventStreams.get(Number(userId)) || new Set();
  for (const res of streams) {
    try { res.write(`data: ${JSON.stringify(payload)}\n\n`); } catch {}
  }
}

function cleanupCallRoomV1002(roomId, delay = 5000) {
  const timer = setTimeout(() => {
    signalingBacklog.delete(roomId);
    const listeners = signalingRooms.get(roomId) || [];
    for (const listener of listeners) { try { listener.res.end(); } catch {} }
    signalingRooms.delete(roomId);
  }, delay);
  timer.unref?.();
}

function register(app, pool, helpers) {
  const { readMyUserId, wrap, requireAdmin } = helpers;
  const getUserEntitlement = typeof helpers.getUserEntitlementV998 === "function"
    ? helpers.getUserEntitlementV998 : null;

  async function callAllowedV1002(userId, mode) {
    const legacyKey = mode === "audio" ? "audio_call" : "video_call";
    const matrixKey = mode === "audio" ? "audio_calls" : "video_calls";
    const minPlan = mode === "audio" ? "gold" : "platinum";
    let grants = [];
    try {
      [grants] = await pool.query(
        `SELECT mode FROM user_feature_grants
          WHERE user_id=? AND feature=? AND revoked_at IS NULL
            AND (expires_at IS NULL OR expires_at>NOW())
          ORDER BY CASE WHEN mode='deny' THEN 0 ELSE 1 END`,
        [userId, legacyKey]
      );
    } catch {}
    if (grants.some((row) => row.mode === "deny")) return { allowed: false, denied: true };
    if (getUserEntitlement) {
      const entitlement = await getUserEntitlement(userId, matrixKey);
      if (entitlement?.enabled) return { allowed: true, denied: false };
      return { allowed: grants.some((row) => row.mode === "allow"), denied: false };
    }
    if (grants.some((row) => row.mode === "allow")) return { allowed: true, denied: false };
    return { allowed: await canUse(pool, userId, legacyKey, minPlan), denied: false };
  }

  function iceServersV1002() {
    const servers = [{ urls: "stun:stun.l.google.com:19302" }];
    const urls = String(process.env.AURA_TURN_URL || "").trim();
    const username = String(process.env.AURA_TURN_USERNAME || "").trim();
    const credential = String(process.env.AURA_TURN_CREDENTIAL || "").trim();
    if (urls && username && credential) servers.push({ urls: urls.split(",").map((v) => v.trim()).filter(Boolean), username, credential });
    return servers;
  }

  async function callByRoomForUserV1002(roomId, userId) {
    const [[call]] = await pool.query(
      "SELECT * FROM video_calls WHERE room_id=? AND (caller_id=? OR callee_id=?) LIMIT 1",
      [roomId, userId, userId]
    ).then((result) => [result[0]]);
    return call || null;
  }

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

  // ==== V1002 · Llamadas WebRTC 1-a-1 (voz y vídeo) =============
  // La matriz de planes es la fuente de verdad. El llamante y el receptor
  // deben compartir una conversación abierta y no estar bloqueados.
  app.post("/api/my/video/start", wrap(async (req, res) => {
    const me = readMyUserId(req);
    if (!me) return res.status(401).json({ error: "unauthorized" });
    const mode = req.body?.mode === "audio" ? "audio" : "video";
    const minPlan = mode === "audio" ? "gold" : "platinum";
    const access = await callAllowedV1002(me, mode);
    if (!access.allowed && access.denied) {
      return res.status(403).json({ error: "feature_denied", message: "Esta función no está disponible para tu cuenta." });
    }
    if (!access.allowed) {
      return res.status(402).json({ error: "plan_required", required_plan: minPlan, feature: mode === "audio" ? "audio_calls" : "video_calls" });
    }
    const callee = parseInt(req.body?.callee_id, 10);
    if (!callee || callee === me) return res.status(400).json({ error: "invalid_callee", message: "No puedes llamarte a ti mismo." });
    const [[peer]] = await pool.query("SELECT id,status,name FROM users WHERE id=? LIMIT 1", [callee]).then((rr) => [rr[0]]);
    if (!peer || peer.status !== "active") return res.status(404).json({ error: "callee_unavailable", message: "Esta persona no está disponible." });
    const [[conversation]] = await pool.query(
      `SELECT id FROM conversations
        WHERE ((user_a=? AND user_b=?) OR (user_a=? AND user_b=?))
          AND status='open' LIMIT 1`,
      [me, callee, callee, me]
    ).then((rr) => [rr[0]]);
    if (!conversation) return res.status(403).json({ error: "conversation_required", message: "Solo puedes llamar desde una conversación activa." });
    const [[blocked]] = await pool.query(
      "SELECT id FROM blocks WHERE (user_id=? AND target_id=?) OR (user_id=? AND target_id=?) LIMIT 1",
      [me, callee, callee, me]
    ).then((rr) => [rr[0]]);
    if (blocked) return res.status(403).json({ error: "call_blocked", message: "La llamada no está disponible." });

    const conn = await pool.getConnection();
    let callId;
    let roomId;
    try {
      await conn.beginTransaction();
      await conn.query("SELECT id FROM users WHERE id IN (?,?) ORDER BY id FOR UPDATE", [me, callee]);
      await conn.execute(
        "UPDATE video_calls SET status='missed',ended_at=NOW(),ended_reason='no_answer' WHERE status='ringing' AND created_at<DATE_SUB(NOW(),INTERVAL 60 SECOND) AND (caller_id IN (?,?) OR callee_id IN (?,?))",
        [me, callee, me, callee]
      );
      await conn.execute(
        "UPDATE video_calls SET status='ended',ended_at=NOW(),ended_reason='connection_lost' WHERE status='accepted' AND COALESCE(last_signal_at,accepted_at,created_at)<DATE_SUB(NOW(),INTERVAL 12 HOUR) AND (caller_id IN (?,?) OR callee_id IN (?,?))",
        [me, callee, me, callee]
      );
      const [[busy]] = await conn.query(
        "SELECT id FROM video_calls WHERE status IN ('ringing','accepted') AND (caller_id IN (?,?) OR callee_id IN (?,?)) LIMIT 1 FOR UPDATE",
        [me, callee, me, callee]
      );
      if (busy) {
        await conn.rollback();
        return res.status(409).json({ error: "user_busy", message: "Uno de los dos ya está en otra llamada." });
      }
      roomId = `room_${me}_${callee}_${Date.now().toString(36)}`;
      const [insert] = await conn.execute(
        "INSERT INTO video_calls (caller_id,callee_id,room_id,status,mode,last_signal_at) VALUES (?,?,?,'ringing',?,NOW())",
        [me, callee, roomId, mode]
      );
      callId = Number(insert.insertId);
      await conn.commit();
    } catch (error) {
      try { await conn.rollback(); } catch {}
      throw error;
    } finally {
      conn.release();
    }
    const [[caller]] = await pool.query("SELECT name FROM users WHERE id=? LIMIT 1", [me]).then((rr) => [rr[0]]);
    const payload = { room_id: roomId, caller_id: me, call_id: callId, mode, caller_name: caller?.name || null };
    await pool.execute(
      "INSERT INTO push_context_events (user_id,kind,payload) VALUES (?,?,?)",
      [callee, "video_call_incoming", JSON.stringify(payload)]
    );
    pushCallEvent(callee, { type: "incoming", ...payload });
    const timeout = setTimeout(async () => {
      try {
        const [update] = await pool.execute(
          "UPDATE video_calls SET status='missed',ended_at=NOW(),ended_reason='no_answer' WHERE id=? AND status='ringing'",
          [callId]
        );
        if (update.affectedRows) {
          const event = { type: "missed", call_id: callId, room_id: roomId };
          pushSignal(roomId, event); pushCallEvent(me, event); pushCallEvent(callee, event);
          cleanupCallRoomV1002(roomId);
        }
      } catch {}
    }, 60000);
    timeout.unref?.();
    res.json({ ok: true, call_id: callId, room_id: roomId, mode, ice_servers: iceServersV1002(), relay_available: iceServersV1002().length > 1 });
  }));

  app.post("/api/my/video/:call_id/accept", wrap(async (req, res) => {
    const me = readMyUserId(req);
    if (!me) return res.status(401).json({ error: "unauthorized" });
    const cid = parseInt(req.params.call_id, 10);
    const [[c]] = await pool.query("SELECT * FROM video_calls WHERE id=? AND callee_id=?", [cid, me]).then((rr)=>[rr[0]]);
    if (!c) return res.status(404).json({ error: "not_found" });
    if (c.status !== "ringing") return res.status(409).json({ error: "call_not_ringing", status: c.status });
    if (Date.now() - new Date(c.created_at).getTime() > 60000) {
      await pool.execute("UPDATE video_calls SET status='missed',ended_at=NOW(),ended_reason='no_answer' WHERE id=? AND status='ringing'", [cid]);
      return res.status(410).json({ error: "call_expired", message: "La llamada ya ha finalizado." });
    }
    const [accepted] = await pool.execute("UPDATE video_calls SET status='accepted',accepted_at=NOW(),last_signal_at=NOW() WHERE id=? AND status='ringing'", [cid]);
    if (!accepted.affectedRows) return res.status(409).json({ error: "call_not_ringing" });
    pushSignal(c.room_id, { type: "accepted", by: me });
    pushCallEvent(c.caller_id, { type: "accepted", call_id: cid, room_id: c.room_id });
    res.json({ ok: true, room_id: c.room_id, mode: c.mode || "video", ice_servers: iceServersV1002(), relay_available: iceServersV1002().length > 1 });
  }));

  app.post("/api/my/video/:call_id/reject", wrap(async (req, res) => {
    const me = readMyUserId(req);
    if (!me) return res.status(401).json({ error: "unauthorized" });
    const cid = parseInt(req.params.call_id, 10);
    const [[c]] = await pool.query("SELECT * FROM video_calls WHERE id=? AND callee_id=?", [cid, me]).then((rr) => [rr[0]]);
    if (!c) return res.status(404).json({ error: "not_found" });
    if (c.status !== "ringing") return res.status(409).json({ error: "call_not_ringing", status: c.status });
    await pool.execute("UPDATE video_calls SET status='rejected',ended_at=NOW(),ended_reason='rejected' WHERE id=?", [cid]);
    const event = { type: "rejected", by: me, call_id: cid, room_id: c.room_id };
    pushSignal(c.room_id, event); pushCallEvent(c.caller_id, event);
    cleanupCallRoomV1002(c.room_id);
    res.json({ ok: true });
  }));

  app.post("/api/my/video/:call_id/end", wrap(async (req, res) => {
    const me = readMyUserId(req);
    if (!me) return res.status(401).json({ error: "unauthorized" });
    const cid = parseInt(req.params.call_id, 10);
    const [[c]] = await pool.query("SELECT * FROM video_calls WHERE id=? AND (caller_id=? OR callee_id=?)", [cid, me, me]).then((rr)=>[rr[0]]);
    if (!c) return res.status(404).json({ error: "not_found" });
    if (["ended", "rejected", "missed"].includes(c.status)) return res.json({ ok: true, status: c.status });
    const reason = c.status === "ringing" ? "cancelled" : "hangup";
    await pool.execute("UPDATE video_calls SET status='ended',ended_at=NOW(),ended_reason=? WHERE id=?", [reason, cid]);
    pushSignal(c.room_id, { type: "ended", by: me });
    const peerId = Number(c.caller_id) === Number(me) ? c.callee_id : c.caller_id;
    pushCallEvent(peerId, { type: "ended", by: me, call_id: cid, room_id: c.room_id });
    cleanupCallRoomV1002(c.room_id);
    setTimeout(() => { autoTriageCall(pool, cid).catch(()=>{}); }, 500);
    res.json({ ok: true });
  }));

  // Canal inmediato de llamadas entrantes. La tabla sigue siendo el respaldo
  // persistente; este SSE evita esperar al sondeo periódico de notificaciones.
  app.get("/api/my/video/events", async (req, res) => {
    const me = readMyUserId(req);
    if (!me) return res.status(401).end();
    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache, no-transform");
    res.setHeader("Connection", "keep-alive");
    res.flushHeaders?.();
    const streams = callEventStreams.get(Number(me)) || new Set();
    streams.add(res); callEventStreams.set(Number(me), streams);
    res.write(`data: ${JSON.stringify({ type: "connected" })}\n\n`);
    const keepalive = setInterval(() => { try { res.write(": keepalive\n\n"); } catch {} }, 25000);
    req.on("close", () => {
      clearInterval(keepalive);
      streams.delete(res);
      if (!streams.size) callEventStreams.delete(Number(me));
    });
  });

  app.get("/api/my/video/pending", wrap(async (req, res) => {
    const me = readMyUserId(req);
    if (!me) return res.status(401).json({ error: "unauthorized" });
    await pool.execute(
      "UPDATE video_calls SET status='missed',ended_at=NOW(),ended_reason='no_answer' WHERE callee_id=? AND status='ringing' AND created_at<DATE_SUB(NOW(),INTERVAL 60 SECOND)",
      [me]
    );
    const [rows] = await pool.query(
      `SELECT v.id AS call_id,v.room_id,v.caller_id,v.mode,v.created_at,u.name AS caller_name
         FROM video_calls v LEFT JOIN users u ON u.id=v.caller_id
        WHERE v.callee_id=? AND v.status='ringing' AND v.created_at>=DATE_SUB(NOW(),INTERVAL 60 SECOND)
        ORDER BY v.created_at DESC LIMIT 1`,
      [me]
    );
    res.set("Cache-Control", "no-store");
    res.json({ ok: true, call: rows[0] || null });
  }));

  // Señalización: cada acceso comprueba en BD que el usuario pertenece a la
  // llamada. Las señales recientes se reproducen al conectar para que una
  // oferta no se pierda si el receptor tarda unas décimas en abrir su SSE.
  app.get("/api/my/video/room/:room_id/signal", async (req, res) => {
    try {
      const uid = readMyUserId(req);
      if (!uid) return res.status(401).end();
      const roomId = String(req.params.room_id || "").slice(0, 120);
      const call = await callByRoomForUserV1002(roomId, uid);
      if (!call || !["ringing", "accepted"].includes(call.status)) return res.status(403).end();
      res.setHeader("Content-Type", "text/event-stream");
      res.setHeader("Cache-Control", "no-cache, no-transform");
      res.setHeader("Connection", "keep-alive");
      res.flushHeaders?.();
      const list = signalingRooms.get(roomId) || [];
      list.push({ userId: uid, res });
      signalingRooms.set(roomId, list);
      for (const msg of signalingBacklog.get(roomId) || []) {
        if (!msg.from || Number(msg.from) !== Number(uid)) res.write(`data: ${JSON.stringify(msg)}\n\n`);
      }
      const keepalive = setInterval(() => { try { res.write(": keepalive\n\n"); } catch {} }, 25000);
      req.on("close", () => {
        clearInterval(keepalive);
        const cur = signalingRooms.get(roomId) || [];
        const next = cur.filter((s) => s.res !== res);
        if (next.length) signalingRooms.set(roomId, next); else signalingRooms.delete(roomId);
      });
    } catch (error) {
      if (!res.headersSent) res.status(500).end(); else res.end();
    }
  });

  app.post("/api/my/video/room/:room_id/signal", wrap(async (req, res) => {
    const me = readMyUserId(req);
    if (!me) return res.status(401).json({ error: "unauthorized" });
    const roomId = String(req.params.room_id || "").slice(0,120);
    const call = await callByRoomForUserV1002(roomId, me);
    if (!call || !["ringing", "accepted"].includes(call.status)) return res.status(403).json({ error: "not_call_participant" });
    const type = String(req.body?.type || "");
    if (!new Set(["offer", "answer", "ice"]).has(type)) return res.status(400).json({ error: "invalid_signal" });
    if (call.status !== "accepted") return res.status(409).json({ error: "call_not_accepted" });
    if (type === "offer" && Number(call.caller_id) !== Number(me)) return res.status(403).json({ error: "invalid_signal_role" });
    if (type === "answer" && Number(call.callee_id) !== Number(me)) return res.status(403).json({ error: "invalid_signal_role" });
    const msg = { type, from: me };
    if (type === "offer" || type === "answer") {
      const sdp = req.body?.sdp;
      if (!sdp || typeof sdp !== "object" || sdp.type !== type || typeof sdp.sdp !== "string" || sdp.sdp.length > 100000) {
        return res.status(400).json({ error: "invalid_signal_payload" });
      }
      msg.sdp = { type, sdp: sdp.sdp };
    }
    if (type === "ice") {
      const candidate = req.body?.candidate;
      if (!candidate || typeof candidate !== "object" || typeof candidate.candidate !== "string" || candidate.candidate.length > 4096) {
        return res.status(400).json({ error: "invalid_signal_payload" });
      }
      msg.candidate = {
        candidate: candidate.candidate,
        sdpMid: candidate.sdpMid == null ? null : String(candidate.sdpMid).slice(0, 64),
        sdpMLineIndex: Number.isInteger(candidate.sdpMLineIndex) ? candidate.sdpMLineIndex : null,
        usernameFragment: candidate.usernameFragment == null ? null : String(candidate.usernameFragment).slice(0, 256),
      };
    }
    if ((type !== "ice" && !msg.sdp) || (type === "ice" && !msg.candidate)) return res.status(400).json({ error: "invalid_signal_payload" });
    await pool.execute("UPDATE video_calls SET last_signal_at=NOW() WHERE id=?", [call.id]);
    pushSignal(roomId, msg);
    res.json({ ok: true });
  }));

  // Compatibilidad segura: clientes antiguos reciben un rechazo explícito y
  // no pueden subir contenido de llamadas.
  app.post("/api/my/video/:call_id/recording", wrap(async (req, res) => {
    if (!readMyUserId(req)) return res.status(401).json({ error: "unauthorized" });
    res.status(410).json({ error: "recording_disabled", message: "Aura no graba ni almacena el contenido de las llamadas." });
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
      `SELECT v.*, ca.name AS caller_name, ce.name AS callee_name,
              TIMESTAMPDIFF(SECOND,COALESCE(v.accepted_at,v.created_at),COALESCE(v.ended_at,NOW())) AS duration_seconds
         FROM video_calls v
         LEFT JOIN users ca ON ca.id=v.caller_id
         LEFT JOIN users ce ON ce.id=v.callee_id
        ${where}
        ORDER BY v.created_at DESC LIMIT 500`,
      params
    );
    res.json({ ok: true, items: rows });
  }));

  // V1002 · Detalle administrativo: solo metadatos, nunca contenido.
  app.get("/api/admin/video/calls/:id", requireAdmin, wrap(async (req, res) => {
    const id = parseInt(req.params.id, 10);
    const [[c]] = await pool.query(
      `SELECT v.*, ca.name AS caller_name, ca.email AS caller_email,
              ce.name AS callee_name, ce.email AS callee_email,
              TIMESTAMPDIFF(SECOND,COALESCE(v.accepted_at,v.created_at),COALESCE(v.ended_at,NOW())) AS duration_seconds
         FROM video_calls v
         LEFT JOIN users ca ON ca.id=v.caller_id
         LEFT JOIN users ce ON ce.id=v.callee_id
        WHERE v.id=? LIMIT 1`, [id]
    ).then((rr)=>[rr[0]]);
    if (!c) return res.status(404).json({ error: "not_found" });
    const [[legacy]] = await pool.query("SELECT COUNT(*) AS count FROM call_recordings WHERE call_id=?", [id]).then((rr) => [rr[0]]);
    res.json({ ok: true, call: c, legacy_recordings_count: Number(legacy?.count || 0) });
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

// V1002 · Triage por metadatos. El contenido no se graba ni se inspecciona.
async function autoTriageCall(pool, callId) {
  const [[c]] = await pool.query("SELECT * FROM video_calls WHERE id=? LIMIT 1", [callId]).then((rr)=>[rr[0]]);
  if (!c) return { skipped: true };
  const start = c.accepted_at || c.created_at;
  const durMs = c.ended_at && start ? (new Date(c.ended_at).getTime() - new Date(start).getTime()) : 0;
  const flags = []; let dept = "none"; let score = 0;
  if (c.status === "rejected" || c.status === "missed") { dept = "support"; flags.push("no_answer"); score += 10; }
  else if (durMs > 0 && durMs < 3000) { dept = "quality"; flags.push("too_short"); score += 20; }
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
