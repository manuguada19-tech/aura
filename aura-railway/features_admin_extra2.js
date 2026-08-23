/* =====================================================================
   AURA — V713 · Segundo lote de endpoints admin que devolvían 404
   ---------------------------------------------------------------------
   Detectados por capturas del panel (con sesión admin real, el gate
   requireAdmin deja pasar y la ruta inexistente responde 404). Todos
   estos endpoints los llamaba public/admin.js pero nunca existieron.
   Añadido ADITIVO y retrocompatible: crea su propia tabla
   (device_incidents) si falta y NO toca ninguna ruta existente.

   Endpoints:
     Moderación:
       GET  /api/admin/mod-templates            + POST + DELETE/:id
       POST /api/moderation/auto-assign
       GET  /api/reports/grouped-by-user
       POST /api/reports/user/:id/resolve-all
     Tickets:
       POST /api/tickets/auto-assign
     Pagos:
       GET  /api/payments/metrics
       GET  /api/payments/refunds
       GET  /api/payments/disputes
       GET  /api/payments/invoices-export   (CSV, auth por ?adminToken)
     Estadísticas:
       GET  /api/stats/cohorts
     Usuarios:
       POST /api/users/bulk                 { ids:[], action }
     Dispositivos perdidos (device_incidents):
       GET  /api/admin/device-incidents          (?status)
       GET  /api/admin/device-incidents/kpis
       GET  /api/admin/device-incidents/:id
       POST /api/admin/device-incidents/:id/approve|deny|lock|unlock
            |schedule-lock|play-sound|send-message|close
       GET  /api/admin/device-incidents/:id/gps-trail|audit-export
   ===================================================================== */
"use strict";

async function migrate(pool) {
  // Plantillas de moderación
  await pool.query(`CREATE TABLE IF NOT EXISTS admin_mod_templates (
    id INT AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(160) NOT NULL,
    action VARCHAR(40) NOT NULL DEFAULT 'warn',
    body TEXT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`);

  // Incidentes de dispositivo perdido (panel V500 sin backend hasta ahora)
  await pool.query(`CREATE TABLE IF NOT EXISTS device_incidents (
    id INT AUTO_INCREMENT PRIMARY KEY,
    user_id INT NULL,
    type VARCHAR(40) NOT NULL DEFAULT 'lost',
    status ENUM('pending_evidence','pending_admin','approved','active','denied','closed','archived') NOT NULL DEFAULT 'pending_admin',
    reason TEXT NULL,
    police_report_url VARCHAR(500) NULL,
    verify_selfie_url VARCHAR(500) NULL,
    verify_match_score INT NULL,
    frozen_last_lat DECIMAL(10,7) NULL,
    frozen_last_lng DECIMAL(10,7) NULL,
    frozen_last_ip VARCHAR(64) NULL,
    locked_at TIMESTAMP NULL,
    scheduled_lock_at TIMESTAMP NULL,
    lock_reason VARCHAR(255) NULL,
    lock_message VARCHAR(500) NULL,
    requested_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    reviewed_at TIMESTAMP NULL,
    deny_reason VARCHAR(255) NULL,
    INDEX idx_status (status),
    INDEX idx_user (user_id)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`);

  // Registro de auditoría de acciones sobre incidentes
  await pool.query(`CREATE TABLE IF NOT EXISTS device_incident_actions (
    id INT AUTO_INCREMENT PRIMARY KEY,
    incident_id INT NOT NULL,
    action VARCHAR(40) NOT NULL,
    detail VARCHAR(500) NULL,
    admin_email VARCHAR(190) NULL,
    hash CHAR(64) NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_inc (incident_id)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`);
}

function register(app, pool, helpers) {
  const { wrap } = helpers;
  registerModeration(app, pool, wrap);
  registerTickets(app, pool, wrap);
  registerPayments(app, pool, wrap, helpers);
  registerStats(app, pool, wrap);
  registerUsersBulk(app, pool, wrap);
  registerDeviceIncidents(app, pool, wrap);
}

// ==================== MODERACIÓN ====================
function registerModeration(app, pool, wrap) {
  const idOf = (req) => parseInt(req.params.id, 10) || 0;

  // Plantillas rápidas de moderación
  app.get("/api/admin/mod-templates", wrap(async (req, res) => {
    const [items] = await pool.query(
      "SELECT id, name, action, body FROM admin_mod_templates ORDER BY id DESC"
    );
    res.json({ ok: true, items });
  }));
  app.post("/api/admin/mod-templates", wrap(async (req, res) => {
    const name = String(req.body?.name || "").trim().slice(0, 160);
    if (!name) return res.status(400).json({ error: "name_required" });
    const action = String(req.body?.action || "warn").slice(0, 40);
    const body = String(req.body?.body || "");
    const [r] = await pool.execute(
      "INSERT INTO admin_mod_templates (name, action, body) VALUES (?,?,?)",
      [name, action, body]
    );
    res.json({ ok: true, id: r.insertId });
  }));
  app.delete("/api/admin/mod-templates/:id", wrap(async (req, res) => {
    await pool.execute("DELETE FROM admin_mod_templates WHERE id=?", [idOf(req)]);
    res.json({ ok: true });
  }));

  // Auto-asignar denuncias: pasa las 10 más antiguas abiertas a "reviewing"
  app.post("/api/moderation/auto-assign", wrap(async (req, res) => {
    const [rows] = await pool.query(
      "SELECT id FROM reports WHERE status='open' ORDER BY created_at ASC LIMIT 10"
    );
    if (rows.length) {
      const ids = rows.map((r) => r.id);
      await pool.query(
        `UPDATE reports SET status='reviewing' WHERE id IN (${ids.map(() => "?").join(",")})`,
        ids
      );
    }
    res.json({ ok: true, count: rows.length });
  }));

  // Denuncias agrupadas por usuario denunciado
  app.get("/api/reports/grouped-by-user", wrap(async (req, res) => {
    const [rows] = await pool.query(
      `SELECT r.target_id AS user_id, u.name, u.email,
              COUNT(*) AS count,
              GROUP_CONCAT(DISTINCT r.reason ORDER BY r.reason SEPARATOR '||') AS reasons
         FROM reports r
         LEFT JOIN users u ON u.id = r.target_id
        WHERE r.status IN ('open','reviewing','escalated')
        GROUP BY r.target_id, u.name, u.email
        ORDER BY count DESC
        LIMIT 200`
    );
    const items = rows.map((r) => ({
      user_id: r.user_id,
      name: r.name,
      email: r.email,
      count: Number(r.count) || 0,
      reasons: r.reasons ? String(r.reasons).split("||") : [],
    }));
    res.json({ ok: true, items });
  }));

  // Resolver todas las denuncias abiertas de un usuario
  app.post("/api/reports/user/:id/resolve-all", wrap(async (req, res) => {
    const uid = idOf(req);
    if (!uid) return res.status(400).json({ error: "id_required" });
    const [r] = await pool.execute(
      "UPDATE reports SET status='resolved', resolved_at=NOW() WHERE target_id=? AND status IN ('open','reviewing','escalated')",
      [uid]
    );
    res.json({ ok: true, affected: r.affectedRows || 0 });
  }));
}
// ==================== TICKETS ====================
function registerTickets(app, pool, wrap) {
  // Auto-asignar: pasa hasta 10 tickets abiertos a "in_progress"
  app.post("/api/tickets/auto-assign", wrap(async (req, res) => {
    const [rows] = await pool.query(
      "SELECT id FROM support_tickets WHERE status='open' ORDER BY created_at ASC LIMIT 10"
    );
    if (rows.length) {
      const ids = rows.map((r) => r.id);
      await pool.query(
        `UPDATE support_tickets SET status='in_progress' WHERE id IN (${ids.map(() => "?").join(",")})`,
        ids
      );
    }
    res.json({ ok: true, count: rows.length });
  }));
}
// ==================== PAGOS ====================
function registerPayments(app, pool, wrap, helpers) {
  const mrrExpr =
    "CASE plan WHEN 'premium' THEN 9.99 WHEN 'gold' THEN 19.99 WHEN 'platinum' THEN 29.99 ELSE 0 END";

  // Métricas MRR/ARR/LTV/ticket medio/método top
  app.get("/api/payments/metrics", wrap(async (req, res) => {
    const [[{ mrr }]] = await pool.query(
      `SELECT COALESCE(SUM(${mrrExpr}),0) mrr FROM users WHERE plan<>'free' AND status='active' AND role='user'`
    );
    const [[{ total, cnt }]] = await pool.query(
      "SELECT COALESCE(SUM(amount),0) total, COUNT(*) cnt FROM payments WHERE status='completed'"
    );
    const [[{ payers }]] = await pool.query(
      "SELECT COUNT(DISTINCT user_id) payers FROM payments WHERE status='completed'"
    );
    const [methodRows] = await pool.query(
      "SELECT method, COUNT(*) n FROM payments WHERE status='completed' AND method IS NOT NULL GROUP BY method ORDER BY n DESC LIMIT 1"
    );
    const mrrN = Number(mrr) || 0;
    const totalN = Number(total) || 0;
    const cntN = Number(cnt) || 0;
    res.json({
      ok: true,
      mrr: Math.round(mrrN * 100) / 100,
      arr: Math.round(mrrN * 12 * 100) / 100,
      ltv: payers ? Math.round((totalN / payers) * 100) / 100 : 0,
      avg_ticket: cntN ? Math.round((totalN / cntN) * 100) / 100 : 0,
      top_method: methodRows[0]?.method || "—",
    });
  }));

  // Reembolsos (pagos con estado refunded)
  app.get("/api/payments/refunds", wrap(async (req, res) => {
    const [items] = await pool.query(
      `SELECT p.id, p.user_id, u.email AS user_email, p.amount, p.created_at,
              p.method AS reason, p.status
         FROM payments p
         LEFT JOIN users u ON u.id = p.user_id
        WHERE p.status='refunded'
        ORDER BY p.created_at DESC LIMIT 300`
    );
    res.json({ ok: true, items });
  }));

  // Disputas / chargebacks: no hay tabla dedicada → best-effort con pagos fallidos
  app.get("/api/payments/disputes", wrap(async (req, res) => {
    const [items] = await pool.query(
      `SELECT p.id, p.user_id, u.email AS user_email, p.amount, p.created_at,
              p.method AS reason, p.status
         FROM payments p
         LEFT JOIN users u ON u.id = p.user_id
        WHERE p.status='failed'
        ORDER BY p.created_at DESC LIMIT 300`
    );
    res.json({ ok: true, items });
  }));

  // Exportación de facturas SII (CSV). El frontend abre en pestaña nueva con
  // ?adminToken=..., así que el gate global ya valida por query. Devolvemos CSV.
  app.get("/api/payments/invoices-export", wrap(async (req, res) => {
    const year = parseInt(req.query.year, 10) || new Date().getFullYear();
    const [rows] = await pool.query(
      `SELECT p.invoice_no, p.created_at, u.name, u.email, p.amount, p.currency,
              p.method, p.status
         FROM payments p
         LEFT JOIN users u ON u.id = p.user_id
        WHERE YEAR(p.created_at)=? AND p.status IN ('completed','refunded')
        ORDER BY p.created_at ASC`,
      [year]
    );
    const esc = (v) => {
      const s = v == null ? "" : String(v);
      return /[",\n;]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
    };
    const header = ["Factura", "Fecha", "Nombre", "Email", "Importe", "Moneda", "Metodo", "Estado"];
    const lines = [header.join(";")];
    for (const r of rows) {
      lines.push([
        esc(r.invoice_no), esc(r.created_at ? new Date(r.created_at).toISOString().slice(0, 10) : ""),
        esc(r.name), esc(r.email), esc(r.amount), esc(r.currency),
        esc(r.method), esc(r.status),
      ].join(";"));
    }
    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader("Content-Disposition", `attachment; filename="facturas-sii-${year}.csv"`);
    res.send("\uFEFF" + lines.join("\n"));
  }));
}
// ==================== ESTADÍSTICAS ====================
function registerStats(app, pool, wrap) {
  // Cohortes de retención por semana de alta. Sin log de actividad histórico,
  // aproximamos "sigue activo en la semana N" con updated_at (última actividad
  // registrada). Best-effort, igual que el churn de V712.
  app.get("/api/stats/cohorts", wrap(async (req, res) => {
    const [rows] = await pool.query(
      `SELECT YEARWEEK(created_at, 3) AS yw,
              DATE(DATE_SUB(created_at, INTERVAL WEEKDAY(created_at) DAY)) AS wk_start,
              id, created_at, updated_at
         FROM users
        WHERE role='user' AND created_at >= NOW() - INTERVAL 12 WEEK`
    );
    const cohorts = new Map();
    for (const u of rows) {
      const key = String(u.yw);
      if (!cohorts.has(key)) {
        cohorts.set(key, { label: u.wk_start, users: [] });
      }
      cohorts.get(key).users.push(u);
    }
    const items = [];
    for (const { label, users } of cohorts.values()) {
      const size = users.length;
      const row = { cohort: label instanceof Date ? label.toISOString().slice(0, 10) : String(label) };
      for (let w = 0; w < 9; w++) {
        if (w === 0) { row.w0 = size ? 100 : 0; continue; }
        // usuarios cuya última actividad cae al menos w semanas tras su alta
        const retained = users.filter((u) => {
          if (!u.updated_at || !u.created_at) return false;
          const diffWeeks = (new Date(u.updated_at) - new Date(u.created_at)) / (7 * 864e5);
          return diffWeeks >= w;
        }).length;
        row["w" + w] = size ? Math.round((retained / size) * 100) : null;
      }
      items.push(row);
    }
    items.sort((a, b) => (a.cohort < b.cohort ? 1 : -1));
    res.json({ ok: true, items });
  }));
}
// ==================== USUARIOS (bulk) ====================
function registerUsersBulk(app, pool, wrap) {
  const STATUS = { ban: "banned", suspend: "suspended", activate: "active", unban: "active" };
  app.post("/api/users/bulk", wrap(async (req, res) => {
    const ids = Array.isArray(req.body?.ids)
      ? req.body.ids.map((n) => parseInt(n, 10)).filter((n) => Number.isFinite(n) && n > 0)
      : [];
    const action = String(req.body?.action || "");
    if (!ids.length) return res.status(400).json({ error: "ids_required" });
    const ph = ids.map(() => "?").join(",");
    let affected = 0;
    if (STATUS[action]) {
      const [r] = await pool.query(
        `UPDATE users SET status=? WHERE id IN (${ph}) AND role='user'`,
        [STATUS[action], ...ids]
      );
      affected = r.affectedRows || 0;
    } else if (action === "delete") {
      const [r] = await pool.query(
        `UPDATE users SET status='banned' WHERE id IN (${ph}) AND role='user'`,
        ids
      );
      affected = r.affectedRows || 0;
    } else {
      return res.status(400).json({ error: "unknown_action" });
    }
    res.json({ ok: true, affected, count: affected });
  }));
}
// ==================== DISPOSITIVOS PERDIDOS ====================
function registerDeviceIncidents(app, pool, wrap) {
  const crypto = require("crypto");
  const idOf = (req) => parseInt(req.params.id, 10) || 0;

  async function logAction(incidentId, action, detail, adminEmail) {
    const payload = `${incidentId}|${action}|${detail || ""}|${Date.now()}`;
    const hash = crypto.createHash("sha256").update(payload).digest("hex");
    await pool.execute(
      "INSERT INTO device_incident_actions (incident_id, action, detail, admin_email, hash) VALUES (?,?,?,?,?)",
      [incidentId, action, detail ? String(detail).slice(0, 500) : null, adminEmail || null, hash]
    );
  }

  const SELECT_CARD = `
    SELECT di.id, di.user_id, di.type, di.status, di.reason,
           di.police_report_url, di.verify_selfie_url, di.verify_match_score,
           di.frozen_last_lat, di.frozen_last_lng, di.frozen_last_ip,
           di.locked_at, di.scheduled_lock_at, di.requested_at, di.reviewed_at,
           u.name AS user_name, u.email
      FROM device_incidents di
      LEFT JOIN users u ON u.id = di.user_id`;

  // Listado (?status opcional)
  app.get("/api/admin/device-incidents", wrap(async (req, res) => {
    const args = [];
    let where = "";
    if (req.query.status) { where = " WHERE di.status=?"; args.push(String(req.query.status)); }
    const [rows] = await pool.query(
      `${SELECT_CARD}${where} ORDER BY di.requested_at DESC LIMIT 300`, args
    );
    res.json({ ok: true, items: rows });
  }));

  // KPIs (esta ruta debe ir ANTES que /:id para no colisionar)
  app.get("/api/admin/device-incidents/kpis", wrap(async (req, res) => {
    const [[{ active }]] = await pool.query("SELECT COUNT(*) active FROM device_incidents WHERE status='active'");
    const [[{ pending_admin }]] = await pool.query("SELECT COUNT(*) pending_admin FROM device_incidents WHERE status='pending_admin'");
    const [[{ locked }]] = await pool.query("SELECT COUNT(*) locked FROM device_incidents WHERE locked_at IS NOT NULL AND status='active'");
    const [[{ approved_7d }]] = await pool.query("SELECT COUNT(*) approved_7d FROM device_incidents WHERE status IN ('approved','active') AND reviewed_at >= NOW() - INTERVAL 7 DAY");
    const [[{ total }]] = await pool.query("SELECT COUNT(*) total FROM device_incidents");
    res.json({ ok: true, active, pending_admin, locked, approved_7d, total });
  }));

  // Detalle
  app.get("/api/admin/device-incidents/:id", wrap(async (req, res) => {
    const [[inc]] = await pool.query(`${SELECT_CARD} WHERE di.id=? LIMIT 1`, [idOf(req)]);
    if (!inc) return res.status(404).json({ error: "not_found" });
    let kyc = null;
    if (inc.user_id) {
      const [[k]] = await pool.query(
        "SELECT selfie_url FROM identity_verifications WHERE user_id=? ORDER BY id DESC LIMIT 1",
        [inc.user_id]
      ).catch(() => [[null]]);
      kyc = k || null;
    }
    const [actions] = await pool.query(
      "SELECT action, detail, admin_email, hash, created_at FROM device_incident_actions WHERE incident_id=? ORDER BY id DESC LIMIT 100",
      [inc.id]
    );
    const current_gps = inc.frozen_last_lat
      ? { lat: Number(inc.frozen_last_lat), lng: Number(inc.frozen_last_lng) }
      : null;
    res.json({ ok: true, incident: inc, kyc, current_gps, actions });
  }));

  // Trail GPS (best-effort: solo la última ubicación congelada)
  app.get("/api/admin/device-incidents/:id/gps-trail", wrap(async (req, res) => {
    const [[inc]] = await pool.query(
      "SELECT frozen_last_lat lat, frozen_last_lng lng, requested_at FROM device_incidents WHERE id=? LIMIT 1",
      [idOf(req)]
    );
    const points = inc && inc.lat != null
      ? [{ lat: Number(inc.lat), lng: Number(inc.lng), at: inc.requested_at }]
      : [];
    res.json({ ok: true, points });
  }));

  // Exportación de auditoría (JSON con firma hash por acción)
  app.get("/api/admin/device-incidents/:id/audit-export", wrap(async (req, res) => {
    const id = idOf(req);
    const [actions] = await pool.query(
      "SELECT action, detail, admin_email, hash, created_at FROM device_incident_actions WHERE incident_id=? ORDER BY id ASC",
      [id]
    );
    res.setHeader("Content-Type", "application/json; charset=utf-8");
    res.setHeader("Content-Disposition", `attachment; filename="auditoria-incidente-${id}.json"`);
    res.send(JSON.stringify({ incident_id: id, exported_at: new Date().toISOString(), actions }, null, 2));
  }));

  // ---- Acciones (POST) ----
  const admEmail = (req) => (req.admin && req.admin.email) || null;

  app.post("/api/admin/device-incidents/:id/approve", wrap(async (req, res) => {
    const id = idOf(req);
    await pool.execute("UPDATE device_incidents SET status='approved', reviewed_at=NOW() WHERE id=?", [id]);
    await logAction(id, "approve", null, admEmail(req));
    res.json({ ok: true });
  }));
  app.post("/api/admin/device-incidents/:id/deny", wrap(async (req, res) => {
    const id = idOf(req);
    const reason = String(req.body?.reason || "").slice(0, 255);
    await pool.execute("UPDATE device_incidents SET status='denied', deny_reason=?, reviewed_at=NOW() WHERE id=?", [reason, id]);
    await logAction(id, "deny", reason, admEmail(req));
    res.json({ ok: true });
  }));
  app.post("/api/admin/device-incidents/:id/lock", wrap(async (req, res) => {
    const id = idOf(req);
    const reason = String(req.body?.reason || "").slice(0, 255);
    const message = String(req.body?.message || "").slice(0, 500);
    await pool.execute(
      "UPDATE device_incidents SET status='active', locked_at=NOW(), lock_reason=?, lock_message=? WHERE id=?",
      [reason, message, id]
    );
    await logAction(id, "lock", reason, admEmail(req));
    res.json({ ok: true });
  }));
  app.post("/api/admin/device-incidents/:id/unlock", wrap(async (req, res) => {
    const id = idOf(req);
    await pool.execute("UPDATE device_incidents SET locked_at=NULL, scheduled_lock_at=NULL WHERE id=?", [id]);
    await logAction(id, "unlock", null, admEmail(req));
    res.json({ ok: true });
  }));
  app.post("/api/admin/device-incidents/:id/schedule-lock", wrap(async (req, res) => {
    const id = idOf(req);
    const hours = Math.min(720, Math.max(1, parseInt(req.body?.hours, 10) || 24));
    await pool.execute("UPDATE device_incidents SET scheduled_lock_at=NOW() + INTERVAL ? HOUR WHERE id=?", [hours, id]);
    await logAction(id, "schedule-lock", hours + "h", admEmail(req));
    res.json({ ok: true, hours });
  }));
  app.post("/api/admin/device-incidents/:id/play-sound", wrap(async (req, res) => {
    const id = idOf(req);
    await logAction(id, "play-sound", String(req.body?.message || "").slice(0, 200), admEmail(req));
    res.json({ ok: true });
  }));
  app.post("/api/admin/device-incidents/:id/send-message", wrap(async (req, res) => {
    const id = idOf(req);
    await logAction(id, "send-message", String(req.body?.message || "").slice(0, 200), admEmail(req));
    res.json({ ok: true });
  }));
  app.post("/api/admin/device-incidents/:id/close", wrap(async (req, res) => {
    const id = idOf(req);
    await pool.execute("UPDATE device_incidents SET status='closed' WHERE id=?", [id]);
    await logAction(id, "close", null, admEmail(req));
    res.json({ ok: true });
  }));
}

module.exports = { migrate, register };
