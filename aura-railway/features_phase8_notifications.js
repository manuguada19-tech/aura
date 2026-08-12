/* =====================================================================
   AURA — Fase 8 · Notificaciones in-app (V587)
   ---------------------------------------------------------------------
   La tabla `notifications` ya existe (migrate de server.js) y otros
   módulos insertan en ella (p.ej. phase7: canjes aprobados/rechazados/
   concedidos). Esta fase expone los endpoints de lectura/gestión:

   Público autenticado:
     GET  /api/my/notifications              → mis notificaciones (100 últimas) + unread
     GET  /api/my/notifications/unread-count → contador rápido para el badge (polling)
     POST /api/my/notifications/:id/read     → marcar una como leída
     POST /api/my/notifications/read-all     → marcar todas como leídas

   Admin:
     GET  /api/admin/notifications/sent        → historial global de enviadas
     POST /api/admin/notifications/send        → enviar manual a un usuario
     POST /api/admin/notifications/bulk-delete → borrar {ids} o {all:true}
   ===================================================================== */
"use strict";

async function migrate(pool) {
  // La tabla la crea server.js migrate(); aquí solo garantizamos que exista
  // en instalaciones donde se cargue esta fase de forma aislada.
  await pool.query(`CREATE TABLE IF NOT EXISTS notifications (
    id INT AUTO_INCREMENT PRIMARY KEY,
    user_id INT NOT NULL,
    type VARCHAR(40) NOT NULL,
    title VARCHAR(200) NOT NULL,
    body TEXT NULL,
    icon VARCHAR(60) NULL,
    data JSON NULL,
    email_subject VARCHAR(200) NULL,
    email_html LONGTEXT NULL,
    email_sent BOOLEAN DEFAULT FALSE,
    email_error VARCHAR(200) NULL,
    read_at TIMESTAMP NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_user (user_id),
    INDEX idx_type (type)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`);

  // V592 · Preferencias de notificaciones por usuario (todo activado por defecto).
  // Sin fila = defaults. Los "mensajes del equipo" in-app no son desactivables
  // (comunicación importante); su push sí.
  await pool.query(`CREATE TABLE IF NOT EXISTS notification_prefs (
    user_id INT PRIMARY KEY,
    rewards_inapp TINYINT(1) NOT NULL DEFAULT 1,
    rewards_push  TINYINT(1) NOT NULL DEFAULT 1,
    admin_push    TINYINT(1) NOT NULL DEFAULT 1,
    matches_inapp TINYINT(1) NOT NULL DEFAULT 1,
    matches_push  TINYINT(1) NOT NULL DEFAULT 1,
    chat_push     TINYINT(1) NOT NULL DEFAULT 1,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`);

  // V631 · Nueva preferencia: avisos de "like recibido" en la campana (in-app).
  // Additiva y retrocompatible: por defecto activada. Se añade con ALTER si la
  // tabla ya existía sin la columna (instalaciones previas).
  try {
    await pool.query("ALTER TABLE notification_prefs ADD COLUMN likes_inapp TINYINT(1) NOT NULL DEFAULT 1");
  } catch (e) { /* la columna ya existe */ }
}

// V592 · Claves válidas de preferencias (y sus defaults)
// V631 · likes_inapp añadida (avisos de like recibido en la campana).
const PREF_KEYS = ["rewards_inapp", "rewards_push", "admin_push", "matches_inapp", "matches_push", "chat_push", "likes_inapp"];
function prefDefaults() {
  const o = {};
  for (const k of PREF_KEYS) o[k] = true;
  return o;
}

function register(app, pool, helpers) {
  const { readMyUserId, wrap, requireAdmin } = helpers;
  // V589 · push web opcional acompañando a la notificación in-app (no-op si no está configurado)
  const pushToUser = typeof helpers.pushToUser === "function" ? helpers.pushToUser : async () => ({ sent: 0 });

  // ---------- Público: mis notificaciones -------------------------------
  app.get("/api/my/notifications", wrap(async (req, res) => {
    const me = readMyUserId(req);
    if (!me) return res.status(401).json({ ok: false, error: "auth" });
    const [rows] = await pool.query(
      `SELECT id, type, title, body, icon, data, read_at, created_at
         FROM notifications
        WHERE user_id=?
        ORDER BY id DESC LIMIT 100`,
      [me]
    );
    const unread = rows.filter((r) => !r.read_at).length;
    res.json({ ok: true, unread, items: rows });
  }));

  // ---------- Público: contador para el badge (polling ligero) ----------
  app.get("/api/my/notifications/unread-count", wrap(async (req, res) => {
    const me = readMyUserId(req);
    if (!me) return res.status(401).json({ ok: false, error: "auth" });
    const [rows] = await pool.query(
      "SELECT COUNT(*) AS c FROM notifications WHERE user_id=? AND read_at IS NULL",
      [me]
    );
    res.json({ ok: true, unread: rows[0]?.c || 0 });
  }));

  // ---------- Público: marcar una como leída ----------------------------
  app.post("/api/my/notifications/:id/read", wrap(async (req, res) => {
    const me = readMyUserId(req);
    if (!me) return res.status(401).json({ ok: false, error: "auth" });
    const id = Number(req.params.id);
    if (!id) return res.status(400).json({ ok: false, error: "id" });
    await pool.query(
      "UPDATE notifications SET read_at=NOW() WHERE id=? AND user_id=? AND read_at IS NULL",
      [id, me]
    );
    res.json({ ok: true });
  }));

  // ---------- Público: marcar todas como leídas -------------------------
  app.post("/api/my/notifications/read-all", wrap(async (req, res) => {
    const me = readMyUserId(req);
    if (!me) return res.status(401).json({ ok: false, error: "auth" });
    const [r] = await pool.query(
      "UPDATE notifications SET read_at=NOW() WHERE user_id=? AND read_at IS NULL",
      [me]
    );
    res.json({ ok: true, marked: r.affectedRows });
  }));

  // ---------- Público: leer preferencias (V592) -------------------------
  app.get("/api/my/notification-prefs", wrap(async (req, res) => {
    const me = readMyUserId(req);
    if (!me) return res.status(401).json({ ok: false, error: "auth" });
    const [rows] = await pool.query("SELECT * FROM notification_prefs WHERE user_id=? LIMIT 1", [me]);
    const prefs = prefDefaults();
    if (rows[0]) for (const k of PREF_KEYS) prefs[k] = !!rows[0][k];
    res.json({ ok: true, prefs });
  }));

  // ---------- Público: guardar preferencias (V592) ----------------------
  app.post("/api/my/notification-prefs", wrap(async (req, res) => {
    const me = readMyUserId(req);
    if (!me) return res.status(401).json({ ok: false, error: "auth" });
    const body = req.body || {};
    const prefs = prefDefaults();
    // Partimos de lo guardado (si existe) y aplicamos solo claves válidas
    const [rows] = await pool.query("SELECT * FROM notification_prefs WHERE user_id=? LIMIT 1", [me]);
    if (rows[0]) for (const k of PREF_KEYS) prefs[k] = !!rows[0][k];
    for (const k of PREF_KEYS) if (k in body) prefs[k] = !!body[k];
    await pool.query(
      `INSERT INTO notification_prefs (user_id, ${PREF_KEYS.join(", ")})
       VALUES (?, ${PREF_KEYS.map(() => "?").join(", ")})
       ON DUPLICATE KEY UPDATE ${PREF_KEYS.map((k) => `${k}=VALUES(${k})`).join(", ")}`,
      [me, ...PREF_KEYS.map((k) => (prefs[k] ? 1 : 0))]
    );
    res.json({ ok: true, prefs });
  }));

  // ---------- Admin: historial global de enviadas ------------------------
  app.get("/api/admin/notifications/sent", requireAdmin, wrap(async (req, res) => {
    const [rows] = await pool.query(
      `SELECT n.id, n.user_id, n.type, n.title, n.body, n.icon, n.data,
              n.email_sent, n.email_error, n.read_at, n.created_at,
              u.email AS user_email, u.name AS user_name
         FROM notifications n
         LEFT JOIN users u ON u.id = n.user_id
        ORDER BY n.id DESC LIMIT 1000`
    );
    res.json({ ok: true, items: rows });
  }));

  // ---------- Admin: enviar notificación manual --------------------------
  app.post("/api/admin/notifications/send", requireAdmin, wrap(async (req, res) => {
    const { user_id, title, body, icon, type } = req.body || {};
    if (!user_id || !title) return res.status(400).json({ ok: false, error: "user_id y title son obligatorios" });
    const [uRows] = await pool.query("SELECT id FROM users WHERE id=? LIMIT 1", [Number(user_id)]);
    if (!uRows[0]) return res.status(404).json({ ok: false, error: "usuario_no_existe" });
    const [ins] = await pool.query(
      `INSERT INTO notifications (user_id, type, title, body, icon, data)
       VALUES (?,?,?,?,?,?)`,
      [
        Number(user_id),
        String(type || "admin_message").slice(0, 40),
        String(title).slice(0, 200),
        body ? String(body) : null,
        icon ? String(icon).slice(0, 60) : "📣",
        JSON.stringify({ sent_by: req.admin?.email || "admin" }),
      ]
    );
    // V589 · push web (best-effort): la notificación llega aunque la app esté cerrada
    // V592 · respeta la preferencia admin_push del usuario
    const push = await pushToUser(Number(user_id), {
      title: String(title).slice(0, 200),
      body: body ? String(body) : "",
      tag: "admin_message",
    }, "admin_push");
    res.json({ ok: true, id: ins.insertId, push_sent: push.sent || 0 });
  }));

  // ---------- Admin: bulk delete ------------------------------------------
  app.post("/api/admin/notifications/bulk-delete", requireAdmin, wrap(async (req, res) => {
    const ids = Array.isArray(req.body?.ids) ? req.body.ids.map((x) => parseInt(x, 10)).filter(Number.isFinite) : [];
    if (req.body?.all === true) {
      const [r] = await pool.execute("DELETE FROM notifications");
      return res.json({ ok: true, deleted: r.affectedRows });
    }
    if (!ids.length) return res.json({ ok: true, deleted: 0 });
    const [r] = await pool.query(`DELETE FROM notifications WHERE id IN (${ids.map(() => "?").join(",")})`, ids);
    res.json({ ok: true, deleted: r.affectedRows });
  }));

  console.log("[phase8] endpoints de notificaciones registrados");
}

module.exports = { migrate, register };
