/* =====================================================================
   AURA — Zonas · Historial y monitorización por zona (V613)
   ---------------------------------------------------------------------
   Cada usuario pertenece a UNA zona (hetero / lgtb). Cambiar de zona borra
   la cuenta y obliga a registrarse de nuevo. Este módulo:

   1) Mantiene, para cada usuario y zona, una "residencia" (zone_residencies)
      con datos de uso agregados que se actualizan PROGRESIVAMENTE mientras el
      usuario está activo en esa zona (mensajes, llamadas, likes, matches…).

   2) Al cambiar de zona, ARCHIVA un snapshot completo de la residencia actual
      (incluidos los chats y las llamadas en crudo) para que el equipo pueda
      saber qué hizo ese usuario en esa zona, y DESPUÉS elimina la cuenta.
      No se descarga ninguna copia: el archivado es interno.

   3) Expone endpoints de administración para monitorizar en vivo todas las
      zonas y a cada usuario dentro de ellas.

   Público autenticado (X-User-Id):
     POST /api/my/zone/change   → archiva la zona actual y elimina la cuenta

   Admin (Bearer adminToken):
     GET /api/admin/zones/overview          → resumen por zona
     GET /api/admin/zones/:zone/users       → usuarios (activos + pasados) de una zona
     GET /api/admin/zones/user/:uid         → residencias (zonas) de un usuario
     GET /api/admin/zones/residency/:id     → snapshot completo + chats/llamadas
   ===================================================================== */
"use strict";

const ZONES = ["hetero", "lgtb"];

async function migrate(pool) {
  // Residencia por (usuario, zona). status: 'active' mientras el usuario está
  // en esa zona; 'left' cuando la abandonó (cambio de zona o baja).
  await pool.query(`CREATE TABLE IF NOT EXISTS zone_residencies (
    id INT AUTO_INCREMENT PRIMARY KEY,
    user_id INT NULL,
    email VARCHAR(190) NULL,
    name VARCHAR(120) NULL,
    zone VARCHAR(16) NOT NULL,
    status ENUM('active','left') NOT NULL DEFAULT 'active',
    started_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    ended_at TIMESTAMP NULL,
    last_active TIMESTAMP NULL,
    messages_sent INT NOT NULL DEFAULT 0,
    calls_made INT NOT NULL DEFAULT 0,
    calls_received INT NOT NULL DEFAULT 0,
    likes_given INT NOT NULL DEFAULT 0,
    matches_count INT NOT NULL DEFAULT 0,
    conversations_count INT NOT NULL DEFAULT 0,
    snapshot JSON NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    UNIQUE KEY uniq_user_zone (user_id, zone),
    INDEX idx_zone (zone),
    INDEX idx_status (status)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`);

  // Copia en crudo de los chats del usuario en el momento de abandonar la zona.
  await pool.query(`CREATE TABLE IF NOT EXISTS zone_archive_messages (
    id INT AUTO_INCREMENT PRIMARY KEY,
    residency_id INT NOT NULL,
    user_id INT NULL,
    zone VARCHAR(16) NOT NULL,
    conversation_id INT NULL,
    peer_id INT NULL,
    peer_name VARCHAR(120) NULL,
    sender_id INT NULL,
    body TEXT NULL,
    media_type VARCHAR(16) NULL,
    media_url VARCHAR(500) NULL,
    sent_at TIMESTAMP NULL,
    archived_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_res (residency_id),
    INDEX idx_conv (conversation_id)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`);

  // Copia en crudo de las llamadas del usuario en el momento de abandonar.
  await pool.query(`CREATE TABLE IF NOT EXISTS zone_archive_calls (
    id INT AUTO_INCREMENT PRIMARY KEY,
    residency_id INT NOT NULL,
    user_id INT NULL,
    zone VARCHAR(16) NOT NULL,
    call_id INT NULL,
    caller_id INT NULL,
    callee_id INT NULL,
    direction VARCHAR(10) NULL,
    status VARCHAR(20) NULL,
    mode VARCHAR(16) NULL,
    started_at TIMESTAMP NULL,
    archived_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_res (residency_id)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`);
}

/* Calcula, en vivo, los contadores de uso de un usuario a partir de las tablas
   reales. Cada bloque va en try/catch para tolerar tablas ausentes. */
async function computeUsage(pool, userId) {
  const out = {
    messages_sent: 0, calls_made: 0, calls_received: 0,
    likes_given: 0, matches_count: 0, conversations_count: 0,
  };
  try {
    const [r] = await pool.query("SELECT COUNT(*) c FROM messages WHERE sender_id=?", [userId]);
    out.messages_sent = r[0]?.c || 0;
  } catch {}
  try {
    const [r] = await pool.query("SELECT COUNT(*) c FROM video_calls WHERE caller_id=?", [userId]);
    out.calls_made = r[0]?.c || 0;
  } catch {}
  try {
    const [r] = await pool.query("SELECT COUNT(*) c FROM video_calls WHERE callee_id=?", [userId]);
    out.calls_received = r[0]?.c || 0;
  } catch {}
  try {
    const [r] = await pool.query("SELECT COUNT(*) c FROM likes WHERE from_user=?", [userId]);
    out.likes_given = r[0]?.c || 0;
  } catch {}
  try {
    const [r] = await pool.query("SELECT COUNT(*) c FROM matches WHERE user_a=? OR user_b=?", [userId, userId]);
    out.matches_count = r[0]?.c || 0;
  } catch {}
  try {
    const [r] = await pool.query("SELECT COUNT(*) c FROM conversations WHERE user_a=? OR user_b=?", [userId, userId]);
    out.conversations_count = r[0]?.c || 0;
  } catch {}
  return out;
}

/* Garantiza que exista una residencia 'active' para (usuario, zona) y actualiza
   sus contadores + last_active. Se llama PROGRESIVAMENTE (heartbeat/track) para
   que el panel tenga datos en vivo aunque el usuario nunca cambie de zona. */
async function touchResidency(pool, userId, zone, extra) {
  try {
    if (!userId || !zone) return;
    extra = extra || {};
    const usage = await computeUsage(pool, userId);
    await pool.query(
      `INSERT INTO zone_residencies
         (user_id, email, name, zone, status, started_at, last_active,
          messages_sent, calls_made, calls_received, likes_given, matches_count, conversations_count)
       VALUES (?,?,?,?, 'active', NOW(), NOW(), ?,?,?,?,?,?)
       ON DUPLICATE KEY UPDATE
         email=VALUES(email), name=VALUES(name), status='active',
         last_active=NOW(),
         messages_sent=VALUES(messages_sent), calls_made=VALUES(calls_made),
         calls_received=VALUES(calls_received), likes_given=VALUES(likes_given),
         matches_count=VALUES(matches_count), conversations_count=VALUES(conversations_count)`,
      [userId, extra.email || null, extra.name || null, zone,
       usage.messages_sent, usage.calls_made, usage.calls_received,
       usage.likes_given, usage.matches_count, usage.conversations_count]
    );
  } catch { /* silent */ }
}

/* Construye un snapshot completo del usuario en su zona (perfil + contadores +
   listado de conversaciones con nº de mensajes). */
async function buildSnapshot(pool, user, usage) {
  const snap = {
    captured_at: new Date().toISOString(),
    profile: {
      id: user.id, name: user.name, email: user.email, age: user.age,
      gender: user.gender, orientation: user.orientation, city: user.city,
      country: user.country, plan: user.plan, status: user.status,
      created_at: user.created_at, last_login: user.last_login,
    },
    usage,
    conversations: [],
  };
  try {
    const [convs] = await pool.query(
      `SELECT c.id, c.user_a, c.user_b, c.last_message_at, c.created_at,
              (SELECT COUNT(*) FROM messages m WHERE m.conversation_id=c.id) AS total_messages,
              (SELECT COUNT(*) FROM messages m WHERE m.conversation_id=c.id AND m.sender_id=?) AS my_messages
         FROM conversations c
        WHERE c.user_a=? OR c.user_b=?
        ORDER BY c.last_message_at DESC LIMIT 200`,
      [user.id, user.id, user.id]
    );
    snap.conversations = convs;
  } catch {}
  return snap;
}

/* Copia en crudo los chats y llamadas del usuario a las tablas de archivo. */
async function archiveRawData(pool, residencyId, user, zone) {
  // Mensajes de todas sus conversaciones (limite prudente).
  try {
    const [msgs] = await pool.query(
      `SELECT m.id, m.conversation_id, m.sender_id, m.body, m.media_type, m.media_url, m.created_at,
              CASE WHEN c.user_a=? THEN c.user_b ELSE c.user_a END AS peer_id
         FROM messages m
         JOIN conversations c ON c.id = m.conversation_id
        WHERE c.user_a=? OR c.user_b=?
        ORDER BY m.id ASC LIMIT 5000`,
      [user.id, user.id, user.id]
    );
    for (const m of msgs) {
      let peerName = null;
      try {
        const [p] = await pool.query("SELECT name FROM users WHERE id=? LIMIT 1", [m.peer_id]);
        peerName = p[0]?.name || null;
      } catch {}
      await pool.query(
        `INSERT INTO zone_archive_messages
           (residency_id, user_id, zone, conversation_id, peer_id, peer_name, sender_id, body, media_type, media_url, sent_at)
         VALUES (?,?,?,?,?,?,?,?,?,?,?)`,
        [residencyId, user.id, zone, m.conversation_id, m.peer_id, peerName, m.sender_id,
         m.body || null, m.media_type || null, m.media_url || null, m.created_at || null]
      );
    }
  } catch { /* silent */ }
  // Llamadas.
  try {
    const [calls] = await pool.query(
      `SELECT id, caller_id, callee_id, status, mode, created_at
         FROM video_calls
        WHERE caller_id=? OR callee_id=?
        ORDER BY id ASC LIMIT 2000`,
      [user.id, user.id]
    );
    for (const c of calls) {
      await pool.query(
        `INSERT INTO zone_archive_calls
           (residency_id, user_id, zone, call_id, caller_id, callee_id, direction, status, mode, started_at)
         VALUES (?,?,?,?,?,?,?,?,?,?)`,
        [residencyId, user.id, zone, c.id, c.caller_id, c.callee_id,
         c.caller_id === user.id ? "out" : "in", c.status || null, c.mode || null, c.created_at || null]
      );
    }
  } catch { /* silent */ }
}

/* Borra los datos personales del usuario tras archivar. Cada DELETE es
   tolerante a fallos para no dejar el proceso a medias. */
async function purgeUserData(pool, userId, email) {
  const tries = [
    ["messages", "DELETE FROM messages WHERE sender_id=?", [userId]],
    ["conversations", "DELETE FROM conversations WHERE user_a=? OR user_b=?", [userId, userId]],
    ["likes", "DELETE FROM likes WHERE from_user=? OR to_user=?", [userId, userId]],
    ["matches", "DELETE FROM matches WHERE user_a=? OR user_b=?", [userId, userId]],
    ["favorites", "DELETE FROM favorites WHERE user_id=? OR target_id=?", [userId, userId]],
    ["blocks", "DELETE FROM blocks WHERE user_id=? OR target_id=?", [userId, userId]],
    ["photos", "DELETE FROM photos WHERE user_id=?", [userId]],
    ["notifications", "DELETE FROM notifications WHERE user_id=?", [userId]],
    ["stories", "DELETE FROM stories WHERE user_id=?", [userId]],
    ["devices", "DELETE FROM devices WHERE user_id=?", [userId]],
    ["video_calls", "DELETE FROM video_calls WHERE caller_id=? OR callee_id=?", [userId, userId]],
    ["identity_verifications", "DELETE FROM identity_verifications WHERE user_id=? OR (email IS NOT NULL AND email=?)", [userId, email]],
    ["users", "DELETE FROM users WHERE id=?", [userId]],
  ];
  for (const [, sql, params] of tries) {
    try { await pool.execute(sql, params); } catch { /* silent */ }
  }
}

function register(app, pool, helpers) {
  const { readMyUserId, wrap, requireAdmin } = helpers;
  const logActivity = typeof helpers.logActivity === "function" ? helpers.logActivity : async () => {};

  // ---------- Público: cambiar de zona (archiva + elimina) ----------------
  app.post("/api/my/zone/change", wrap(async (req, res) => {
    const me = readMyUserId(req);
    if (!me) return res.status(401).json({ ok: false, error: "unauthorized" });
    const target = String(req.body?.target_zone || "").toLowerCase();
    if (!ZONES.includes(target)) return res.status(400).json({ ok: false, error: "bad_target_zone" });

    const [urows] = await pool.query("SELECT * FROM users WHERE id=? LIMIT 1", [me]);
    if (!urows.length) return res.status(404).json({ ok: false, error: "user_not_found" });
    const user = urows[0];
    const fromZone = user.zone || "hetero";
    if (fromZone === target) return res.status(400).json({ ok: false, error: "same_zone" });

    // 1) Calcular uso y snapshot.
    const usage = await computeUsage(pool, me);
    const snapshot = await buildSnapshot(pool, user, usage);

    // 2) Marcar/crear la residencia de la zona ACTUAL como 'left' con snapshot.
    let residencyId = null;
    try {
      await pool.query(
        `INSERT INTO zone_residencies
           (user_id, email, name, zone, status, started_at, ended_at, last_active,
            messages_sent, calls_made, calls_received, likes_given, matches_count, conversations_count, snapshot)
         VALUES (?,?,?,?, 'left', ?, NOW(), NOW(), ?,?,?,?,?,?, ?)
         ON DUPLICATE KEY UPDATE
           email=VALUES(email), name=VALUES(name), status='left', ended_at=NOW(), last_active=NOW(),
           messages_sent=VALUES(messages_sent), calls_made=VALUES(calls_made),
           calls_received=VALUES(calls_received), likes_given=VALUES(likes_given),
           matches_count=VALUES(matches_count), conversations_count=VALUES(conversations_count),
           snapshot=VALUES(snapshot)`,
        [me, user.email || null, user.name || null, fromZone, user.created_at || new Date(),
         usage.messages_sent, usage.calls_made, usage.calls_received,
         usage.likes_given, usage.matches_count, usage.conversations_count,
         JSON.stringify(snapshot)]
      );
      const [rid] = await pool.query(
        "SELECT id FROM zone_residencies WHERE user_id=? AND zone=? LIMIT 1", [me, fromZone]
      );
      residencyId = rid[0]?.id || null;
    } catch { /* silent */ }

    // 3) Archivar chats y llamadas en crudo.
    if (residencyId) {
      try { await archiveRawData(pool, residencyId, user, fromZone); } catch {}
    }

    // 4) Notificar al panel de administración.
    try {
      await logActivity("zona",
        `Cambio de zona: ${user.name || "Usuario"} (id ${me}${user.email ? " · " + user.email : ""}) dejó ${fromZone} → ${target}. Datos archivados y cuenta eliminada.`);
    } catch {}

    // 5) Eliminar los datos personales del usuario (borrado automático).
    await purgeUserData(pool, me, user.email || null);

    res.json({ ok: true, from_zone: fromZone, to_zone: target, residency_id: residencyId });
  }));

  // ---------- Admin: resumen por zona -------------------------------------
  app.get("/api/admin/zones/overview", requireAdmin, wrap(async (req, res) => {
    const zones = {};
    for (const z of ZONES) zones[z] = { zone: z, active_users: 0, past_residencies: 0, messages: 0, calls: 0, matches: 0 };
    try {
      const [au] = await pool.query("SELECT zone, COUNT(*) c FROM users GROUP BY zone");
      au.forEach((r) => { if (zones[r.zone]) zones[r.zone].active_users = r.c; });
    } catch {}
    try {
      const [pr] = await pool.query("SELECT zone, COUNT(*) c FROM zone_residencies WHERE status='left' GROUP BY zone");
      pr.forEach((r) => { if (zones[r.zone]) zones[r.zone].past_residencies = r.c; });
    } catch {}
    try {
      const [ag] = await pool.query(
        `SELECT zone,
                SUM(messages_sent) m, SUM(calls_made + calls_received) c, SUM(matches_count) mt
           FROM zone_residencies GROUP BY zone`);
      ag.forEach((r) => { if (zones[r.zone]) { zones[r.zone].messages = Number(r.m) || 0; zones[r.zone].calls = Number(r.c) || 0; zones[r.zone].matches = Number(r.mt) || 0; } });
    } catch {}
    res.json({ ok: true, zones: Object.values(zones), server_now: new Date().toISOString() });
  }));

  // ---------- Admin: usuarios de una zona (activos + pasados) -------------
  app.get("/api/admin/zones/:zone/users", requireAdmin, wrap(async (req, res) => {
    const zone = String(req.params.zone || "").toLowerCase();
    if (!ZONES.includes(zone)) return res.status(400).json({ ok: false, error: "bad_zone" });
    const limit = Math.max(1, Math.min(500, parseInt(req.query.limit, 10) || 200));

    // Activos: refrescamos los contadores en vivo de los usuarios de la zona.
    let active = [];
    try {
      const [urows] = await pool.query(
        `SELECT id, name, email, plan, status, last_login, created_at
           FROM users WHERE zone=? ORDER BY last_login DESC LIMIT ?`, [zone, limit]);
      for (const u of urows) {
        const usage = await computeUsage(pool, u.id);
        try { await touchResidency(pool, u.id, zone, { email: u.email, name: u.name }); } catch {}
        active.push({ ...u, ...usage });
      }
    } catch {}

    // Pasados: residencias marcadas como 'left' (usuarios que se fueron).
    let past = [];
    try {
      const [prows] = await pool.query(
        `SELECT id, user_id, email, name, started_at, ended_at, last_active,
                messages_sent, calls_made, calls_received, likes_given, matches_count, conversations_count
           FROM zone_residencies
          WHERE zone=? AND status='left'
          ORDER BY ended_at DESC LIMIT ?`, [zone, limit]);
      past = prows;
    } catch {}

    res.json({ ok: true, zone, active, past, server_now: new Date().toISOString() });
  }));

  // ---------- Admin: todas las zonas de un usuario ------------------------
  app.get("/api/admin/zones/user/:uid", requireAdmin, wrap(async (req, res) => {
    const uid = parseInt(req.params.uid, 10);
    if (!uid) return res.status(400).json({ ok: false, error: "bad_uid" });
    let residencies = [];
    try {
      const [rows] = await pool.query(
        `SELECT id, zone, status, started_at, ended_at, last_active,
                messages_sent, calls_made, calls_received, likes_given, matches_count, conversations_count
           FROM zone_residencies WHERE user_id=? ORDER BY started_at ASC`, [uid]);
      residencies = rows;
    } catch {}
    res.json({ ok: true, user_id: uid, residencies });
  }));

  // ---------- Admin: snapshot completo de una residencia ------------------
  app.get("/api/admin/zones/residency/:id", requireAdmin, wrap(async (req, res) => {
    const id = parseInt(req.params.id, 10);
    if (!id) return res.status(400).json({ ok: false, error: "bad_id" });
    let residency = null, messages = [], calls = [];
    try {
      const [rows] = await pool.query("SELECT * FROM zone_residencies WHERE id=? LIMIT 1", [id]);
      residency = rows[0] || null;
      if (residency && typeof residency.snapshot === "string") {
        try { residency.snapshot = JSON.parse(residency.snapshot); } catch {}
      }
    } catch {}
    try {
      const [m] = await pool.query(
        "SELECT id, conversation_id, peer_id, peer_name, sender_id, body, media_type, media_url, sent_at FROM zone_archive_messages WHERE residency_id=? ORDER BY sent_at ASC LIMIT 5000", [id]);
      messages = m;
    } catch {}
    try {
      const [c] = await pool.query(
        "SELECT id, call_id, caller_id, callee_id, direction, status, mode, started_at FROM zone_archive_calls WHERE residency_id=? ORDER BY started_at ASC LIMIT 2000", [id]);
      calls = c;
    } catch {}
    res.json({ ok: true, residency, messages, calls });
  }));
}

module.exports = { migrate, register, touchResidency, computeUsage, ZONES };
