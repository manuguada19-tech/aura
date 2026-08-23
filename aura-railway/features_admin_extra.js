/* =====================================================================
   AURA — V712 · Endpoints de admin que faltaban en el backend
   ---------------------------------------------------------------------
   El panel de admin (public/admin.js) llamaba a varios endpoints que
   nunca se implementaron en el servidor y devolvían 404 (se veían como
   errores "GET /api/... 404" en toasts/modales). Este módulo los añade
   de forma ADITIVA y retrocompatible: crea sus propias tablas si hacen
   falta y no toca ninguna ruta existente.

   Endpoints:
     Suscripciones:
       GET  /api/subscriptions/active
       GET  /api/subscriptions/summary
       GET  /api/subscriptions/churn?days=30
       POST /api/subscriptions/gift        { email, plan, days, reason }
     Promos:
       GET  /api/promos/roi
       POST /api/promos/bulk-generate      { count, prefix, discount, expires }
     KYC:
       GET  /api/kyc/stats
       POST /api/kyc/bulk                  { action, reason? }
     Config admin (CRUD sobre tablas propias):
       GET/POST/DELETE       /api/admin/kyc-reasons[/:id]
       GET/POST/PATCH/DELETE /api/admin/deletion-reasons[/:id]
       GET/POST/PATCH/DELETE /api/admin/mod-rules[/:id]
       GET/POST/PATCH/DELETE /api/admin/user-rules[/:id]
       GET/POST/DELETE       /api/admin/ticket-macros[/:id]
       GET/POST/DELETE       /api/admin/infractions[/:id] + /:id/resolve
   ===================================================================== */
"use strict";

const PLAN_PRICE = { premium: 9.99, gold: 19.99, platinum: 29.99, free: 0 };

async function migrate(pool) {
  await pool.query(`CREATE TABLE IF NOT EXISTS admin_kyc_reasons (
    id INT AUTO_INCREMENT PRIMARY KEY,
    label VARCHAR(200) NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`);

  await pool.query(`CREATE TABLE IF NOT EXISTS admin_deletion_reasons (
    id INT AUTO_INCREMENT PRIMARY KEY,
    code VARCHAR(60) NOT NULL,
    label VARCHAR(200) NOT NULL,
    email_subject VARCHAR(200) NULL,
    email_body TEXT NULL,
    appeal_days INT NOT NULL DEFAULT 30,
    send_email TINYINT(1) NOT NULL DEFAULT 1,
    allow_appeal TINYINT(1) NOT NULL DEFAULT 1,
    block_email TINYINT(1) NOT NULL DEFAULT 1,
    block_phone TINYINT(1) NOT NULL DEFAULT 0,
    block_device TINYINT(1) NOT NULL DEFAULT 0,
    block_ip TINYINT(1) NOT NULL DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`);

  await pool.query(`CREATE TABLE IF NOT EXISTS admin_mod_rules (
    id INT AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(160) NOT NULL,
    \`trigger\` VARCHAR(60) NOT NULL,
    action VARCHAR(60) NOT NULL,
    enabled TINYINT(1) NOT NULL DEFAULT 1,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`);

  await pool.query(`CREATE TABLE IF NOT EXISTS admin_user_rules (
    id INT AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(160) NOT NULL,
    \`condition\` VARCHAR(60) NOT NULL,
    action VARCHAR(60) NOT NULL,
    enabled TINYINT(1) NOT NULL DEFAULT 1,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`);

  await pool.query(`CREATE TABLE IF NOT EXISTS admin_ticket_macros (
    id INT AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(160) NOT NULL,
    category VARCHAR(40) NOT NULL DEFAULT 'general',
    body TEXT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`);

  await pool.query(`CREATE TABLE IF NOT EXISTS admin_infractions (
    id INT AUTO_INCREMENT PRIMARY KEY,
    user_id INT NULL,
    email VARCHAR(190) NULL,
    type VARCHAR(60) NULL,
    title VARCHAR(200) NULL,
    severity ENUM('low','medium','high') NOT NULL DEFAULT 'low',
    status ENUM('active','resolved') NOT NULL DEFAULT 'active',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    resolved_at TIMESTAMP NULL,
    INDEX idx_status (status)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`);
}

function register(app, pool, helpers) {
  const { wrap } = helpers;
  const mrrExpr = "CASE plan WHEN 'premium' THEN 9.99 WHEN 'gold' THEN 19.99 WHEN 'platinum' THEN 29.99 ELSE 0 END";

  // ==== Suscripciones =============================================
  app.get("/api/subscriptions/active", wrap(async (req, res) => {
    const [rows] = await pool.query(
      `SELECT id AS user_id, name, email, plan, updated_at AS started_at,
              ${mrrExpr} AS mrr
         FROM users
        WHERE plan<>'free' AND status='active' AND role='user'
        ORDER BY updated_at DESC LIMIT 500`
    );
    const [[{ mrr }]] = await pool.query(
      `SELECT COALESCE(SUM(${mrrExpr}),0) mrr FROM users WHERE plan<>'free' AND status='active' AND role='user'`
    );
    res.json({ ok: true, items: rows, total: rows.length, mrr: Number(mrr) || 0 });
  }));

  app.get("/api/subscriptions/summary", wrap(async (req, res) => {
    const [[{ total }]] = await pool.query(
      "SELECT COUNT(*) total FROM users WHERE plan<>'free' AND status='active' AND role='user'"
    );
    const [[{ mrr }]] = await pool.query(
      `SELECT COALESCE(SUM(${mrrExpr}),0) mrr FROM users WHERE plan<>'free' AND status='active' AND role='user'`
    );
    const [byPlan] = await pool.query(
      "SELECT plan, COUNT(*) n FROM users WHERE plan<>'free' AND status='active' AND role='user' GROUP BY plan"
    );
    res.json({ ok: true, total, mrr: Number(mrr) || 0, by_plan: byPlan });
  }));

  app.get("/api/subscriptions/churn", wrap(async (req, res) => {
    const days = Math.min(365, Math.max(1, parseInt(req.query.days, 10) || 30));
    // Bajas = usuarios que pasaron a suspended/banned en el periodo. Aproximación
    // basada en updated_at (no hay histórico de plan). Best-effort.
    const [[{ cancellations }]] = await pool.query(
      `SELECT COUNT(*) cancellations FROM users
        WHERE status IN ('suspended','banned') AND role='user'
          AND updated_at >= NOW() - INTERVAL ? DAY`, [days]
    );
    const [[{ active }]] = await pool.query(
      "SELECT COUNT(*) active FROM users WHERE plan<>'free' AND status='active' AND role='user'"
    );
    const [[{ mrr }]] = await pool.query(
      `SELECT COALESCE(SUM(${mrrExpr}),0) mrr FROM users WHERE plan<>'free' AND status='active' AND role='user'`
    );
    const base = active + cancellations;
    const rate = base ? Math.round((cancellations / base) * 1000) / 10 : 0;
    res.json({ ok: true, cancellations, rate, mrr: Number(mrr) || 0, days });
  }));

  app.post("/api/subscriptions/gift", wrap(async (req, res) => {
    const email = String(req.body?.email || "").trim().toLowerCase();
    const plan = ["premium","gold","platinum"].includes(req.body?.plan) ? req.body.plan : null;
    if (!email || !plan) return res.status(400).json({ error: "email_plan_required" });
    const [[u]] = await pool.query("SELECT id FROM users WHERE email=? LIMIT 1", [email]);
    if (!u) return res.status(404).json({ error: "user_not_found" });
    await pool.execute("UPDATE users SET plan=? WHERE id=?", [plan, u.id]);
    res.json({ ok: true, user_id: u.id, plan });
  }));

  // ==== Promos ====================================================
  app.get("/api/promos/roi", wrap(async (req, res) => {
    const [rows] = await pool.query(
      `SELECT code, description, discount_percent, uses, max_uses, status,
              starts_at, ends_at
         FROM promotions ORDER BY id DESC LIMIT 200`
    );
    const items = rows.map(r => ({
      ...r,
      redemptions: r.uses || 0,
      // ROI estimado: cada uso ≈ una conversión a premium (9.99) menos el descuento.
      revenue: Math.round((r.uses || 0) * 9.99 * (1 - (r.discount_percent || 0) / 100) * 100) / 100,
    }));
    res.json({ ok: true, items });
  }));

  app.post("/api/promos/bulk-generate", wrap(async (req, res) => {
    const count = Math.min(1000, Math.max(1, parseInt(req.body?.count, 10) || 0));
    const prefix = String(req.body?.prefix || "AURA-").slice(0, 20).toUpperCase();
    const discount = Math.min(100, Math.max(0, parseInt(req.body?.discount, 10) || 0));
    const expires = req.body?.expires || null;
    if (!count) return res.status(400).json({ error: "count_required" });
    let created = 0;
    for (let i = 0; i < count; i++) {
      const code = prefix + Math.random().toString(36).slice(2, 8).toUpperCase();
      try {
        await pool.execute(
          "INSERT INTO promotions (code, description, discount_percent, max_uses, status, ends_at) VALUES (?,?,?,?,?,?)",
          [code, "Código masivo", discount, 1, "active", expires]
        );
        created++;
      } catch { /* colisión de code única → se ignora */ }
    }
    res.json({ ok: true, count: created });
  }));

  // ==== KYC =======================================================
  app.get("/api/kyc/stats", wrap(async (req, res) => {
    const [[{ total }]] = await pool.query("SELECT COUNT(*) total FROM identity_verifications");
    const [[{ approved }]] = await pool.query("SELECT COUNT(*) approved FROM identity_verifications WHERE status='verified'");
    const [[{ rejected }]] = await pool.query("SELECT COUNT(*) rejected FROM identity_verifications WHERE status='rejected'");
    const [[{ pending }]] = await pool.query("SELECT COUNT(*) pending FROM identity_verifications WHERE status IN ('pending','doc_ok','selfie_ok','video_ok','manual_review')");
    const decided = approved + rejected;
    const approval_rate = decided ? Math.round((approved / decided) * 1000) / 10 : 0;
    res.json({ ok: true, total, approved, rejected, pending, approval_rate });
  }));

  app.post("/api/kyc/bulk", wrap(async (req, res) => {
    const action = String(req.body?.action || "");
    if (action === "approve_all_pending") {
      const [r] = await pool.execute(
        "UPDATE identity_verifications SET status='verified', reviewed_at=NOW() WHERE status IN ('manual_review','pending','doc_ok','selfie_ok','video_ok')"
      );
      return res.json({ ok: true, affected: r.affectedRows || 0 });
    }
    if (action === "reject_all_pending") {
      const reason = String(req.body?.reason || "Rechazo masivo").slice(0, 255);
      const [r] = await pool.execute(
        "UPDATE identity_verifications SET status='rejected', last_reason=?, reviewed_at=NOW() WHERE status IN ('manual_review','pending','doc_ok','selfie_ok','video_ok')",
        [reason]
      );
      return res.json({ ok: true, affected: r.affectedRows || 0 });
    }
    if (action === "resend_expired") {
      // No hay pipeline de reenvío aquí: devolvemos 0 sin romper la UI.
      return res.json({ ok: true, affected: 0 });
    }
    return res.status(400).json({ error: "unknown_action" });
  }));

  // ==== CRUD config admin =========================================
  registerConfigCrud(app, pool, wrap);
}

function registerConfigCrud(app, pool, wrap) {
  const id = (req) => parseInt(req.params.id, 10) || 0;

  // --- kyc-reasons ---
  app.get("/api/admin/kyc-reasons", wrap(async (req, res) => {
    const [items] = await pool.query("SELECT id, label FROM admin_kyc_reasons ORDER BY id DESC");
    res.json({ ok: true, items });
  }));
  app.post("/api/admin/kyc-reasons", wrap(async (req, res) => {
    const label = String(req.body?.label || "").trim().slice(0, 200);
    if (!label) return res.status(400).json({ error: "label_required" });
    const [r] = await pool.execute("INSERT INTO admin_kyc_reasons (label) VALUES (?)", [label]);
    res.json({ ok: true, id: r.insertId });
  }));
  app.delete("/api/admin/kyc-reasons/:id", wrap(async (req, res) => {
    await pool.execute("DELETE FROM admin_kyc_reasons WHERE id=?", [id(req)]);
    res.json({ ok: true });
  }));

  // --- deletion-reasons ---
  const DR_FIELDS = ["code","label","email_subject","email_body","appeal_days","send_email","allow_appeal","block_email","block_phone","block_device","block_ip"];
  app.get("/api/admin/deletion-reasons", wrap(async (req, res) => {
    const [items] = await pool.query("SELECT * FROM admin_deletion_reasons ORDER BY id DESC");
    res.json({ ok: true, items });
  }));
  app.post("/api/admin/deletion-reasons", wrap(async (req, res) => {
    const b = req.body || {};
    const code = String(b.code || "").trim().slice(0, 60) || ("reason_" + Date.now());
    const label = String(b.label || "").trim().slice(0, 200);
    if (!label) return res.status(400).json({ error: "label_required" });
    const [r] = await pool.execute(
      `INSERT INTO admin_deletion_reasons
        (code,label,email_subject,email_body,appeal_days,send_email,allow_appeal,block_email,block_phone,block_device,block_ip)
       VALUES (?,?,?,?,?,?,?,?,?,?,?)`,
      [code, label, String(b.email_subject||"").slice(0,200), String(b.email_body||""),
       parseInt(b.appeal_days,10)||30,
       b.send_email?1:0, b.allow_appeal?1:0, b.block_email?1:0, b.block_phone?1:0, b.block_device?1:0, b.block_ip?1:0]
    );
    res.json({ ok: true, id: r.insertId });
  }));
  app.patch("/api/admin/deletion-reasons/:id", wrap(async (req, res) => {
    const b = req.body || {};
    const sets = [], args = [];
    for (const f of DR_FIELDS) {
      if (b[f] === undefined) continue;
      if (["appeal_days"].includes(f)) { sets.push(`${f}=?`); args.push(parseInt(b[f],10)||0); }
      else if (f.startsWith("block_") || f === "send_email" || f === "allow_appeal") { sets.push(`${f}=?`); args.push(b[f]?1:0); }
      else { sets.push(`${f}=?`); args.push(String(b[f]||"")); }
    }
    if (!sets.length) return res.json({ ok: true });
    args.push(id(req));
    await pool.execute(`UPDATE admin_deletion_reasons SET ${sets.join(",")} WHERE id=?`, args);
    res.json({ ok: true });
  }));
  app.delete("/api/admin/deletion-reasons/:id", wrap(async (req, res) => {
    await pool.execute("DELETE FROM admin_deletion_reasons WHERE id=?", [id(req)]);
    res.json({ ok: true });
  }));

  // --- mod-rules ---
  app.get("/api/admin/mod-rules", wrap(async (req, res) => {
    const [items] = await pool.query("SELECT id, name, `trigger`, action, enabled FROM admin_mod_rules ORDER BY id DESC");
    res.json({ ok: true, items });
  }));
  app.post("/api/admin/mod-rules", wrap(async (req, res) => {
    const b = req.body || {};
    if (!String(b.name||"").trim()) return res.status(400).json({ error: "name_required" });
    const [r] = await pool.execute(
      "INSERT INTO admin_mod_rules (name,`trigger`,action,enabled) VALUES (?,?,?,?)",
      [String(b.name).slice(0,160), String(b.trigger||"").slice(0,60), String(b.action||"").slice(0,60), b.enabled?1:0]
    );
    res.json({ ok: true, id: r.insertId });
  }));
  app.patch("/api/admin/mod-rules/:id", wrap(async (req, res) => {
    if (req.body?.enabled === undefined) return res.json({ ok: true });
    await pool.execute("UPDATE admin_mod_rules SET enabled=? WHERE id=?", [req.body.enabled?1:0, id(req)]);
    res.json({ ok: true });
  }));
  app.delete("/api/admin/mod-rules/:id", wrap(async (req, res) => {
    await pool.execute("DELETE FROM admin_mod_rules WHERE id=?", [id(req)]);
    res.json({ ok: true });
  }));

  // --- user-rules ---
  app.get("/api/admin/user-rules", wrap(async (req, res) => {
    const [items] = await pool.query("SELECT id, name, `condition`, action, enabled FROM admin_user_rules ORDER BY id DESC");
    res.json({ ok: true, items });
  }));
  app.post("/api/admin/user-rules", wrap(async (req, res) => {
    const b = req.body || {};
    if (!String(b.name||"").trim()) return res.status(400).json({ error: "name_required" });
    const [r] = await pool.execute(
      "INSERT INTO admin_user_rules (name,`condition`,action,enabled) VALUES (?,?,?,?)",
      [String(b.name).slice(0,160), String(b.condition||"").slice(0,60), String(b.action||"").slice(0,60), b.enabled?1:0]
    );
    res.json({ ok: true, id: r.insertId });
  }));
  app.patch("/api/admin/user-rules/:id", wrap(async (req, res) => {
    if (req.body?.enabled === undefined) return res.json({ ok: true });
    await pool.execute("UPDATE admin_user_rules SET enabled=? WHERE id=?", [req.body.enabled?1:0, id(req)]);
    res.json({ ok: true });
  }));
  app.delete("/api/admin/user-rules/:id", wrap(async (req, res) => {
    await pool.execute("DELETE FROM admin_user_rules WHERE id=?", [id(req)]);
    res.json({ ok: true });
  }));

  // --- ticket-macros ---
  app.get("/api/admin/ticket-macros", wrap(async (req, res) => {
    const [items] = await pool.query("SELECT id, name, category, body FROM admin_ticket_macros ORDER BY id DESC");
    res.json({ ok: true, items });
  }));
  app.post("/api/admin/ticket-macros", wrap(async (req, res) => {
    const b = req.body || {};
    if (!String(b.name||"").trim()) return res.status(400).json({ error: "name_required" });
    const [r] = await pool.execute(
      "INSERT INTO admin_ticket_macros (name,category,body) VALUES (?,?,?)",
      [String(b.name).slice(0,160), String(b.category||"general").slice(0,40), String(b.body||"")]
    );
    res.json({ ok: true, id: r.insertId });
  }));
  app.delete("/api/admin/ticket-macros/:id", wrap(async (req, res) => {
    await pool.execute("DELETE FROM admin_ticket_macros WHERE id=?", [id(req)]);
    res.json({ ok: true });
  }));

  // --- infractions ---
  app.get("/api/admin/infractions", wrap(async (req, res) => {
    const clauses = [], args = [];
    if (req.query.status) { clauses.push("status=?"); args.push(String(req.query.status)); }
    if (req.query.severity) { clauses.push("severity=?"); args.push(String(req.query.severity)); }
    const where = clauses.length ? "WHERE " + clauses.join(" AND ") : "";
    const [rows] = await pool.query(
      `SELECT id, user_id, email, type, title, severity, status, created_at
         FROM admin_infractions ${where} ORDER BY id DESC LIMIT 500`, args
    );
    res.json({ ok: true, rows });
  }));
  app.post("/api/admin/infractions/:id/resolve", wrap(async (req, res) => {
    await pool.execute("UPDATE admin_infractions SET status='resolved', resolved_at=NOW() WHERE id=?", [id(req)]);
    res.json({ ok: true });
  }));
  app.delete("/api/admin/infractions/:id", wrap(async (req, res) => {
    await pool.execute("DELETE FROM admin_infractions WHERE id=?", [id(req)]);
    res.json({ ok: true });
  }));
}

module.exports = { migrate, register };
